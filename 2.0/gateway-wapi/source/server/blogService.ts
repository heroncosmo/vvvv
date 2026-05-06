import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { google } from "googleapis";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { responseFormatFromZodObject } from "@mistralai/mistralai/extra/structChat.js";
import { db } from "./db";
import { storage } from "./storage";
import { getMistralClient, resolveApiKey } from "./mistralClient";
import { chatComplete } from "./llm";
import { createSupabaseServiceClient } from "./supabaseService";
import {
  blogAssetImages,
  blogAuthorProfiles,
  blogContextPacks,
  blogGenerationJobs,
  blogIndexingChecks,
  blogPostMetrics,
  blogPostRevisions,
  blogPostSources,
  blogPosts,
  blogPublishJobs,
  blogSourceSnapshots,
  blogTopics,
  type BlogAssetImage,
  type BlogAuthorProfile,
  type BlogContextPack,
  type BlogPost,
  type BlogSourceSnapshot,
  type BlogTopic,
} from "@shared/schema";
import { HELP_CATEGORIES_META } from "./routes_public_help";
import { HELP_CATEGORIES } from "../client/src/pages/help-center-data";
import {
  buildBlogApprovalSummary,
  isBlogPublishableImageAsset,
  resolveBlogPostStatusAfterEditorialUpdate,
} from "./blogUtils";
import { BLOG_EDITORIAL_MODEL_POSTS, getEditorialModelExamples, type BlogEditorialModelPost } from "./blogFixturePosts";

const BLOG_SYSTEM_CONFIG_KEYS = [
  "blog_base_url",
  "blog_author_name",
  "blog_author_url",
  "blog_author_role",
  "blog_author_bio",
  "blog_author_avatar_url",
  "blog_mistral_text_model",
  "blog_search_console_site_url",
  "blog_search_console_service_account_json",
  "blog_search_console_client_email",
  "blog_search_console_private_key",
  "blog_nvidia_api_key",
  "nvidia_api_key",
  "blog_nvidia_image_model",
  "blog_nvidia_image_fallback_model",
  "blog_hf_api_token",
  "blog_hf_image_model",
  "blog_brand_name",
  "blog_publish_enabled",
  "blog_discovery_enabled",
  "blog_refresh_enabled",
  "blog_methodology_slug",
  "blog_auto_approve_enabled",
  "blog_auto_publish_enabled",
  "blog_publish_max_per_day",
  "blog_publish_min_hours_between",
  "blog_publish_max_cluster_per_week",
  "blog_auto_rewrite_attempts",
] as const;

const DEFAULT_BASE_URL = "https://agentezap.online";
const BLOG_ASSET_DIR = path.join(process.cwd(), "uploads", "blog-assets");
const BLOG_STORAGE_BUCKET = process.env.BLOG_STORAGE_BUCKET || "blog-assets";
const BLOG_MIGRATION_FILE = path.join(process.cwd(), "server", "migrations", "create_blog_tables.sql");
const NVIDIA_IMAGE_TIMEOUT_MS = 45000;
const BLOG_MIN_WORD_COUNT = 750;

const DISCOVERY_SEEDS = [
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
] as const;

const HELP_CATEGORY_LINKS: Record<string, string> = {
  "ia-whatsapp": "/ajuda/categoria/ai-agent",
  "automacao-whatsapp": "/ajuda/categoria/followup",
  "crm-whatsapp": "/ajuda/categoria/contacts",
  "agendamento-whatsapp": "/ajuda/categoria/scheduling",
  "comparativos": "/ajuda/categoria/ai-agent",
  "nichos": "/ajuda",
};

const PRODUCT_PROOF_LIBRARY: Record<string, string[]> = {
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

type BlogIntent = "commercial" | "informational";
type FunnelStage = "tofu" | "mofu" | "bofu";
type TopicStatus = "pending" | "generated" | "published" | "blocked";
type PostStatus = "draft" | "ready" | "published" | "rejected" | "archived";

interface BlogConfig {
  baseUrl: string;
  brandName: string;
  authorName: string;
  authorRole: string;
  authorUrl: string;
  authorBio: string;
  authorAvatarUrl: string | null;
  methodologySlug: string;
  textModel: string;
  searchConsoleSiteUrl: string | null;
  serviceAccountJson: string | null;
  serviceAccountClientEmail: string | null;
  serviceAccountPrivateKey: string | null;
  nvidiaApiKey: string | null;
  nvidiaImageModel: string | null;
  nvidiaImageFallbackModel: string | null;
  hfApiToken: string | null;
  hfImageModel: string | null;
  publishEnabled: boolean;
  discoveryEnabled: boolean;
  refreshEnabled: boolean;
  autoApproveEnabled: boolean;
  autoPublishEnabled: boolean;
  publishMaxPerDay: number;
  publishMinHoursBetween: number;
  publishMaxClusterPerWeek: number;
  autoRewriteAttempts: number;
}

interface DefaultAuthorSeed {
  name: string;
  role: string;
  bio: string;
  expertise: string[];
  clusters: string[];
  isDefault?: boolean;
}

interface BlogBrief {
  titleHint: string;
  keywordPrimary: string;
  keywordsSecondary: string[];
  cluster: string;
  categorySlug: string;
  intent: BlogIntent;
  funnelStage: FunnelStage;
  audience: string;
  problem: string;
  ctaUrl: string;
  ctaLabel: string;
  internalProofs: string[];
  sourceSummary: string;
}

interface BlogFaqItem {
  question: string;
  answer: string;
}

interface BlogSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  proof?: string[];
}

interface BlogDraft {
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  categorySlug: string;
  tags: string[];
  cluster: string;
  intent: BlogIntent;
  funnelStage: FunnelStage;
  keywordPrimary: string;
  keywordsSecondary: string[];
  imagePrompt: string;
  internalProofs: string[];
  sections: BlogSection[];
  faq: BlogFaqItem[];
  ctaLabel: string;
  ctaUrl: string;
}

interface InternalLink {
  href: string;
  label: string;
  kind: "blog" | "help" | "cta" | "home";
}

interface QualityGateResult {
  qualityScore: number;
  duplicateSimilarity: number;
  internalProofCount: number;
  requiredInternalLinks: number;
  unsupportedClaims: number;
  peopleFirstScore: number;
  originalityScore: number;
  publishDelayHours: number;
  wordCount: number;
  passed: boolean;
  notes: string[];
  factualIssues: string[];
  seoIssues: string[];
  styleIssues: string[];
  suggestedFixes: string[];
}

interface PublicPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  categorySlug: string;
  tags: string[];
  cluster: string;
  publishedAt: Date | null;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  readingTimeMinutes: number;
}

interface BlogReferenceItem {
  label: string;
  href: string;
  sourceType: string;
  description?: string;
}

interface HelpArticleCandidate {
  sourceKey: string;
  categoryId: string;
  categoryTitle: string;
  articleId: string;
  title: string;
  description: string;
  content: string;
  url: string;
}

interface SemanticReviewResult {
  passed: boolean;
  qualityScore: number;
  duplicateSimilarity: number;
  unsupportedClaims: number;
  peopleFirstScore: number;
  originalityScore: number;
  notes: string[];
  publishDelayHours: number;
  refreshReason?: string;
  factualIssues: string[];
  seoIssues: string[];
  styleIssues: string[];
  suggestedFixes: string[];
}

interface PublishingCadenceStatus {
  canPublish: boolean;
  waitHours: number;
  reason: string | null;
  lastPublishedAt: Date | null;
  publishedToday: number;
  clusterPublishedThisWeek: number;
  maxPostsPerDay: number;
  minHoursBetweenPosts: number;
  maxClusterPostsPerWeek: number;
}

const DEFAULT_AUTHOR_ROSTER: DefaultAuthorSeed[] = [
  {
    name: "Rodrigo",
    role: "Estrategia comercial e IA",
    bio: "Criador de conteudo da AgenteZap focado em IA no WhatsApp, operacao comercial e desenho de funis com contexto real.",
    expertise: ["ia", "whatsapp", "vendas", "qualificacao", "comparativos"],
    clusters: ["ia-whatsapp", "comparativos"],
    isDefault: true,
  },
  {
    name: "Drielle",
    role: "Atendimento e experiencia do cliente",
    bio: "Criadora de conteudo da AgenteZap focada em atendimento, relacionamento e fluxos de agenda no WhatsApp com experiencia do cliente.",
    expertise: ["atendimento", "agenda", "confirmacao", "experiencia", "nichos"],
    clusters: ["agendamento-whatsapp", "nichos"],
  },
  {
    name: "Heron",
    role: "SEO editorial e aquisicao",
    bio: "Criador de conteudo da AgenteZap focado em buscas comerciais, comparativos, clusters editoriais e paginas que viram demanda qualificada.",
    expertise: ["seo", "comparativos", "descoberta", "clusters", "conteudo"],
    clusters: ["comparativos", "ia-whatsapp", "crm-whatsapp"],
  },
  {
    name: "Henri",
    role: "Produto e implementacao",
    bio: "Criador de conteudo da AgenteZap focado em implementacao, metricas, configuracao do produto e operacao assistida por IA.",
    expertise: ["produto", "implementacao", "metricas", "ajuda", "integracoes"],
    clusters: ["agendamento-whatsapp", "crm-whatsapp", "automacao-whatsapp", "follow-up", "nichos"],
  },
];

const LEGACY_BLOG_AUTHOR_ALIASES: Record<string, string> = {
  maria: "henri",
  vander: "henri",
};

let ensureBlogInfrastructurePromise: Promise<void> | null = null;
let ensureBlogStorageBucketPromise: Promise<void> | null = null;
let blogPipelineRunPromise: Promise<{ discovered: number; generated?: string; published?: string }> | null = null;
const blogPublishLocks = new Set<string>();

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(date = new Date()): string {
  return date.toISOString().split("T")[0];
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function parseBoolean(value: string | null | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parsePositiveInt(value: string | null | undefined, defaultValue: number, bounds?: { min?: number; max?: number }): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  const min = bounds?.min ?? 1;
  const max = bounds?.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(max, Math.max(min, parsed));
}

function isLocalBlogFixtureMode(): boolean {
  return parseBoolean(process.env.BLOG_LOCAL_FIXTURES, false);
}

function extractJsonObject(raw: string): unknown {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (char === "\"" && !escaped) {
      inString = !inString;
    }

    if (!inString) {
      if (char === "{") {
        if (depth === 0) start = index;
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          return JSON.parse(raw.slice(start, index + 1));
        }
      }
    }

    escaped = char === "\\" && !escaped;
  }

  throw new Error("Resposta do Mistral nao trouxe JSON valido");
}

function readingTimeFromText(text: string): number {
  const words = stripHtml(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 190));
}

function countWordsFromText(text: string): number {
  return stripHtml(text).split(/\s+/).filter(Boolean).length;
}

function similarityScore(a: string, b: string): number {
  const tokensA = new Set(stripHtml(a).toLowerCase().split(/\s+/).filter((item) => item.length > 3));
  const tokensB = new Set(stripHtml(b).toLowerCase().split(/\s+/).filter((item) => item.length > 3));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

const helpSelectionSchema = z.object({
  sourceKeys: z.array(z.string()).max(3).default([]),
});

const discoverySelectionSchema = z.object({
  candidates: z.array(z.object({
    keyword: z.string(),
    title: z.string(),
    cluster: z.string(),
    category: z.string(),
    intent: z.enum(["commercial", "informational"]),
    funnel: z.enum(["tofu", "mofu", "bofu"]),
    score: z.number().int().min(0).max(1000),
    sourceSummary: z.string(),
  })).max(8).default([]),
});

const contextPackSchema = z.object({
  summary: z.string().min(1),
  outline: z.array(z.object({
    heading: z.string(),
    angle: z.string(),
  })).max(6).default([]),
});

function collectPlainTextFragments(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    if (normalized) output.push(normalized);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPlainTextFragments(item, output);
    return;
  }

  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (["href", "url", "link", "src", "type"].includes(key)) continue;
    collectPlainTextFragments(nested, output);
  }
}

function coercePlainTextList(value: unknown, limit: number): string[] {
  const output: string[] = [];
  collectPlainTextFragments(value, output);
  return Array.from(new Set(output)).slice(0, limit);
}

function coercePlainText(value: unknown, fallback = ""): string {
  const list = coercePlainTextList(value, 1);
  return list[0] || fallback;
}

const blogSectionSchema = z.object({
  heading: z.preprocess((value) => coercePlainText(value), z.string()),
  paragraphs: z.preprocess((value) => coercePlainTextList(value, 8), z.array(z.string()).default([])),
  bullets: z.preprocess((value) => coercePlainTextList(value, 8), z.array(z.string()).default([])),
  proof: z.preprocess((value) => coercePlainTextList(value, 6), z.array(z.string()).default([])),
});

const blogFaqSchema = z.object({
  question: z.preprocess((value) => coercePlainText(value), z.string()),
  answer: z.preprocess((value) => coercePlainText(value), z.string()),
});

const blogDraftSchema = z.object({
  title: z.preprocess((value) => coercePlainText(value), z.string()),
  excerpt: z.preprocess((value) => coercePlainText(value), z.string()),
  metaTitle: z.preprocess((value) => coercePlainText(value), z.string()),
  metaDescription: z.preprocess((value) => coercePlainText(value), z.string()),
  categorySlug: z.preprocess((value) => coercePlainText(value), z.string()),
  tags: z.preprocess((value) => coercePlainTextList(value, 8), z.array(z.string()).default([])),
  cluster: z.preprocess((value) => coercePlainText(value), z.string()),
  intent: z.enum(["commercial", "informational"]).default("commercial"),
  funnelStage: z.enum(["tofu", "mofu", "bofu"]).default("mofu"),
  keywordPrimary: z.preprocess((value) => coercePlainText(value), z.string()),
  keywordsSecondary: z.preprocess((value) => coercePlainTextList(value, 6), z.array(z.string()).default([])),
  imagePrompt: z.preprocess((value) => coercePlainText(value), z.string().default("")),
  internalProofs: z.preprocess((value) => coercePlainTextList(value, 6), z.array(z.string()).default([])),
  sections: z.array(blogSectionSchema).default([]),
  faq: z.array(blogFaqSchema).default([]),
  ctaLabel: z.preprocess((value) => coercePlainText(value, "Criar conta gratis"), z.string().default("Criar conta gratis")),
  ctaUrl: z.preprocess((value) => coercePlainText(value, "/cadastro"), z.string().default("/cadastro")),
});

const BLOG_DRAFT_JSON_SHAPE = `{
  "title": "string",
  "excerpt": "string",
  "metaTitle": "string",
  "metaDescription": "string",
  "categorySlug": "string",
  "tags": ["string"],
  "cluster": "string",
  "intent": "commercial|informational",
  "funnelStage": "tofu|mofu|bofu",
  "keywordPrimary": "string",
  "keywordsSecondary": ["string"],
  "imagePrompt": "string",
  "internalProofs": ["string"],
  "sections": [
    {
      "heading": "string",
      "paragraphs": ["string"],
      "bullets": ["string"],
      "proof": ["string"]
    }
  ],
  "faq": [
    { "question": "string", "answer": "string" }
  ],
  "ctaLabel": "string",
  "ctaUrl": "string"
}`;

const semanticReviewSchema = z.object({
  passed: z.boolean(),
  qualityScore: z.number().min(0).max(100),
  peopleFirstScore: z.number().min(0).max(100),
  originalityScore: z.number().min(0).max(100),
  unsupportedClaims: z.number().int().min(0).max(10),
  publishDelayHours: z.number().int().min(0).max(72).default(0),
  notes: z.array(z.string()).max(8).default([]),
  refreshReason: z.string().optional(),
  factualIssues: z.array(z.string()).max(6).default([]),
  seoIssues: z.array(z.string()).max(6).default([]),
  styleIssues: z.array(z.string()).max(6).default([]),
  suggestedFixes: z.array(z.string()).max(8).default([]),
});

const refreshDecisionSchema = z.object({
  postId: z.string().optional().default(""),
  reason: z.string().default(""),
});

const OFFICIAL_SOURCE_LIBRARY: Record<string, BlogReferenceItem[]> = {
  "ia-whatsapp": [
    { label: "WhatsApp Business Platform", href: "https://developers.facebook.com/docs/whatsapp", sourceType: "external-official", description: "DocumentaÃ§Ã£o oficial de integraÃ§Ãµes e operaÃ§Ã£o no WhatsApp." },
    { label: "Google Helpful Content", href: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content", sourceType: "external-official", description: "Diretriz oficial do Google para conteÃºdo people-first." },
    { label: "Google AI Content Guidance", href: "https://developers.google.com/search/blog/2023/02/google-search-and-ai-content", sourceType: "external-official", description: "Como o Google avalia conteÃºdo com uso de IA." },
  ],
  "automacao-whatsapp": [
    { label: "Google Spam Policies", href: "https://developers.google.com/search/docs/essentials/spam-policies", sourceType: "external-official", description: "Regras oficiais para evitar scaled content abuse." },
    { label: "Mistral Structured Output", href: "https://docs.mistral.ai/capabilities/structured_output/structured_output_overview/", sourceType: "external-official", description: "SaÃ­das estruturadas para tarefas de classificaÃ§Ã£o e revisÃ£o." },
    { label: "WhatsApp Business Platform", href: "https://developers.facebook.com/docs/whatsapp", sourceType: "external-official", description: "ReferÃªncia oficial para operaÃ§Ã£o no WhatsApp." },
  ],
  "crm-whatsapp": [
    { label: "Google Article Structured Data", href: "https://developers.google.com/search/docs/appearance/structured-data/article", sourceType: "external-official", description: "Dados estruturados para artigos." },
    { label: "Google ProfilePage Structured Data", href: "https://developers.google.com/search/docs/appearance/structured-data/profile-page", sourceType: "external-official", description: "Dados estruturados de autoria e perfil." },
    { label: "WhatsApp Business Platform", href: "https://developers.facebook.com/docs/whatsapp", sourceType: "external-official", description: "Base oficial para integrar atendimento no WhatsApp." },
  ],
  "agendamento-whatsapp": [
    { label: "Google Discover", href: "https://developers.google.com/search/docs/appearance/google-discover", sourceType: "external-official", description: "Boas prÃ¡ticas para imagens grandes e elegibilidade em Discover." },
    { label: "Google Robots Meta", href: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag", sourceType: "external-official", description: "Uso de max-image-preview:large." },
    { label: "Mistral Document AI", href: "https://docs.mistral.ai/capabilities/document/", sourceType: "external-official", description: "ExtraÃ§Ã£o estruturada de conteÃºdo documental." },
  ],
  "comparativos": [
    { label: "Google Helpful Content", href: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content", sourceType: "external-official", description: "CritÃ©rios people-first do Google." },
    { label: "Google Spam Policies", href: "https://developers.google.com/search/docs/essentials/spam-policies", sourceType: "external-official", description: "Limites para evitar spam e manipulaÃ§Ã£o." },
    { label: "Mistral Image Generation", href: "https://docs.mistral.ai/agents/connectors/image_generation", sourceType: "external-official", description: "DocumentaÃ§Ã£o da geraÃ§Ã£o de imagem usada no pipeline." },
  ],
  "nichos": [
    { label: "Google Helpful Content", href: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content", sourceType: "external-official", description: "Regras do Google para conteÃºdo Ãºtil." },
    { label: "WhatsApp Business Platform", href: "https://developers.facebook.com/docs/whatsapp", sourceType: "external-official", description: "Base oficial de operaÃ§Ã£o no canal." },
    { label: "Mistral Structured Output", href: "https://docs.mistral.ai/capabilities/structured_output/structured_output_overview/", sourceType: "external-official", description: "EstruturaÃ§Ã£o de saÃ­das da revisÃ£o editorial." },
  ],
  "follow-up": [
    { label: "Google Helpful Content", href: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content", sourceType: "external-official", description: "People-first content." },
    { label: "Google Spam Policies", href: "https://developers.google.com/search/docs/essentials/spam-policies", sourceType: "external-official", description: "Evitar scaled content abuse." },
    { label: "Mistral Structured Output", href: "https://docs.mistral.ai/capabilities/structured_output/structured_output_overview/", sourceType: "external-official", description: "ClassificaÃ§Ã£o e revisÃ£o estruturada." },
  ],
};

async function callBlogJsonTask<T>(input: {
  taskName: string;
  prompt: string;
  userMessage: string;
  schema: z.ZodType<T>;
  model: string;
  temperature?: number;
  maxTokens?: number;
  repairHint?: string;
}): Promise<T> {
  try {
    const mistral = await getMistralClient();
    const response = await mistral.chat.complete({
      model: input.model,
      messages: [
        { role: "system", content: `${input.prompt}\nRetorne apenas JSON valido, sem markdown.` },
        { role: "user", content: input.userMessage },
      ],
      responseFormat: responseFormatFromZodObject(input.schema),
      maxTokens: input.maxTokens || 1800,
      temperature: input.temperature ?? 0.2,
    });

    const rawStructured = String(response.choices?.[0]?.message?.content || "").trim();
    const structured = tryParseJsonTaskCandidate(rawStructured, input.schema);
    if (structured.success) return structured.data;
  } catch (error) {
    console.warn(`[BLOG] Structured output fallback em ${input.taskName}:`, error);
  }

  const response = await chatComplete({
    model: input.model,
    messages: [
      { role: "system", content: `${input.prompt}\nRetorne apenas JSON vÃ¡lido, sem markdown.` },
      { role: "user", content: input.userMessage },
    ],
    maxTokens: input.maxTokens || 1800,
    temperature: input.temperature ?? 0.2,
  });

  const raw = String(response.choices?.[0]?.message?.content || "").trim();
  const direct = tryParseJsonTaskCandidate(raw, input.schema);
  if (direct.success) return direct.data;

  const repairResponse = await chatComplete({
    model: input.model,
    messages: [
      {
        role: "system",
        content: [
          "Voce corrige respostas anteriores para virar JSON estritamente valido.",
          "Mantenha apenas informacoes sustentadas pela resposta original.",
          "Nao explique, nao use markdown, nao adicione campos fora do schema pedido pela tarefa original.",
          "Retorne somente um objeto JSON valido.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          taskName: input.taskName,
          originalPrompt: input.prompt,
          originalUserMessage: input.userMessage,
          expectedJsonShape: input.repairHint || "Use exatamente o schema pedido pela tarefa original.",
          normalizationRules: [
            "retorne somente JSON puro",
            "nao use markdown nem cercas de codigo",
            "achate objetos onde o schema espera arrays de string",
            "se faltar campo opcional, devolva array vazio ou string curta segura",
          ],
          invalidModelOutput: raw,
        }),
      },
    ],
    maxTokens: input.maxTokens || 1800,
    temperature: 0,
  });

  const repairedRaw = String(repairResponse.choices?.[0]?.message?.content || "").trim();
  const repaired = tryParseJsonTaskCandidate(repairedRaw, input.schema);
  if (repaired.success) return repaired.data;
  throw new Error(
    `[${input.taskName}] Resposta do modelo nao gerou JSON valido apos reparo. ` +
    `Erro original: ${direct.message}. ` +
    `Erro reparado: ${repaired.message}.`,
  );
}

function extractJsonCandidate(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return extractJsonObject(trimmed);
  }
}

function tryParseJsonTaskCandidate<T>(raw: string, schema: z.ZodType<T>): { success: true; data: T } | { success: false; message: string } {
  try {
    const parsed = extractJsonCandidate(raw);
    const result = schema.safeParse(parsed);
    if (result.success) return { success: true, data: result.data };
    return { success: false, message: result.error.issues?.[0]?.message || "schema invalido" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "json invalido",
    };
  }
}

function stringifyHelpSectionContent(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];

  const chunks: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      chunks.push(item);
      continue;
    }
    if (item && typeof item === "object") {
      for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
        if (key === "screenshot" || key === "src") continue;
        if (typeof value === "string") chunks.push(value);
      }
    }
  }

  return chunks;
}

function getHelpArticleCandidates(): HelpArticleCandidate[] {
  return HELP_CATEGORIES.flatMap((category) => category.articles.map((article) => {
    const content = article.content.flatMap((section) => {
      const parts: string[] = [];
      if (section.heading) parts.push(section.heading);
      if (section.caption) parts.push(section.caption);
      parts.push(...stringifyHelpSectionContent(section.content));
      return parts;
    }).join("\n");

    return {
      sourceKey: `${category.id}:${article.id}`,
      categoryId: category.id,
      categoryTitle: category.title,
      articleId: article.id,
      title: article.title,
      description: article.description,
      content,
      url: `${DEFAULT_BASE_URL}/ajuda/${article.id}`,
    };
  }));
}

async function chooseRelevantHelpArticles(brief: BlogBrief, model: string): Promise<HelpArticleCandidate[]> {
  const candidates = getHelpArticleCandidates().map((item) => ({
    sourceKey: item.sourceKey,
    title: item.title,
    description: item.description,
    categoryTitle: item.categoryTitle,
  }));

  try {
    const selected = await callBlogJsonTask({
      taskName: "help-selection",
      model,
      schema: helpSelectionSchema,
      prompt: "VocÃª seleciona artigos de ajuda internos para enriquecer conteÃºdo editorial do produto.",
      userMessage: JSON.stringify({
        keywordPrimary: brief.keywordPrimary,
        cluster: brief.cluster,
        problem: brief.problem,
        candidates,
      }),
      maxTokens: 900,
    });

    const allowed = new Set(selected.sourceKeys);
    return getHelpArticleCandidates().filter((item) => allowed.has(item.sourceKey)).slice(0, 3);
  } catch {
    return getHelpArticleCandidates().filter((item) => item.categoryId === "ai-agent").slice(0, 2);
  }
}

function getOfficialSourceReferences(cluster: string): BlogReferenceItem[] {
  return (OFFICIAL_SOURCE_LIBRARY[cluster] || OFFICIAL_SOURCE_LIBRARY["comparativos"]).slice(0, 3);
}

function getHelpLinkForCategory(categorySlug: string): string {
  return HELP_CATEGORY_LINKS[categorySlug] || "/ajuda";
}

function getClusterProofs(cluster: string): string[] {
  return PRODUCT_PROOF_LIBRARY[cluster] || PRODUCT_PROOF_LIBRARY["comparativos"];
}

function buildAuthorAvatarDataUri(name: string): string {
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="${escapeHtml(name)}">
  <defs>
    <linearGradient id="authorBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" rx="40" fill="url(#authorBg)"/>
  <circle cx="126" cy="32" r="18" fill="rgba(255,255,255,0.12)"/>
  <text x="80" y="92" text-anchor="middle" fill="#ecfeff" font-family="Arial, sans-serif" font-size="54" font-weight="700">${escapeHtml(initials || "AZ")}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function getDefaultAuthorRoster(config: BlogConfig): DefaultAuthorSeed[] {
  return DEFAULT_AUTHOR_ROSTER.map((author, index) => {
    const canUseConfiguredPrimary = index === 0 && config.authorName && config.authorName !== "Editorial AgenteZap";
    if (!canUseConfiguredPrimary) return author;
    return {
      ...author,
      name: config.authorName,
      role: config.authorRole || author.role,
      bio: config.authorBio || author.bio,
    };
  });
}

function scoreAuthorForBrief(author: BlogAuthorProfile, brief: Pick<BlogBrief, "cluster" | "keywordPrimary" | "keywordsSecondary" | "categorySlug">): number {
  const metadata = readRecord(author.metadata) || {};
  const targetClusters = Array.isArray(metadata.clusters) ? metadata.clusters.map((item) => String(item)) : [];
  const expertise = Array.isArray(author.expertise) ? author.expertise.map((item) => String(item).toLowerCase()) : [];
  const terms = [brief.cluster, brief.categorySlug, brief.keywordPrimary, ...(brief.keywordsSecondary || [])]
    .join(" ")
    .toLowerCase();
  let score = 0;
  if (targetClusters.includes(brief.cluster)) score += 5;
  if (targetClusters.includes(brief.categorySlug)) score += 3;
  for (const item of expertise) {
    if (terms.includes(item.toLowerCase())) score += 1;
  }
  if (author.isDefault) score += 0.25;
  return score;
}

async function ensureAuthorProfiles(config: BlogConfig): Promise<BlogAuthorProfile[]> {
  const roster = getDefaultAuthorRoster(config);
  const profiles: BlogAuthorProfile[] = [];

  for (const author of roster) {
    const slug = slugify(author.name);
    const payload = {
      slug,
      name: author.name,
      role: author.role,
      bio: author.bio,
      avatarUrl: buildAuthorAvatarDataUri(author.name),
      profileUrl: `${config.baseUrl}/blog/autor/${slug}`,
      expertise: author.expertise,
      metadata: {
        company: config.brandName,
        employee: true,
        clusters: author.clusters,
      },
      isDefault: Boolean(author.isDefault),
      updatedAt: new Date(),
    };
    const existing = await db.select().from(blogAuthorProfiles).where(eq(blogAuthorProfiles.slug, slug)).limit(1).then((rows) => rows[0] || null);
    if (existing) {
      const [updated] = await db.update(blogAuthorProfiles).set(payload).where(eq(blogAuthorProfiles.id, existing.id)).returning();
      profiles.push(updated);
      continue;
    }
    const [created] = await db.insert(blogAuthorProfiles).values(payload).returning();
    profiles.push(created);
  }

  return profiles;
}

async function ensureDefaultAuthorProfile(config: BlogConfig): Promise<BlogAuthorProfile> {
  const profiles = await ensureAuthorProfiles(config);
  return profiles.find((profile) => profile.isDefault) || profiles[0];
}

async function selectAuthorProfileForBrief(config: BlogConfig, brief: BlogBrief): Promise<BlogAuthorProfile> {
  const profiles = await ensureAuthorProfiles(config);
  const ranked = profiles
    .map((profile) => ({ profile, score: scoreAuthorForBrief(profile, brief) }))
    .sort((left, right) => right.score - left.score || left.profile.name.localeCompare(right.profile.name, "pt-BR"));
  return ranked[0]?.profile || profiles[0];
}

async function createSourceSnapshot(input: {
  sourceType: string;
  sourceKey: string;
  title: string;
  sourceUrl?: string | null;
  domain?: string | null;
  excerpt?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
}): Promise<BlogSourceSnapshot> {
  const [snapshot] = await db.insert(blogSourceSnapshots).values({
    sourceType: input.sourceType,
    sourceKey: input.sourceKey,
    title: input.title,
    sourceUrl: input.sourceUrl || null,
    domain: input.domain || null,
    excerpt: input.excerpt || null,
    summary: input.summary,
    payload: input.payload || {},
    fetchedAt: new Date(),
  }).returning();

  return snapshot;
}

async function buildContextPack(topic: BlogTopic, brief: BlogBrief, config: BlogConfig, existingPosts: Array<Pick<BlogPost, "title" | "slug" | "cluster" | "categorySlug">>): Promise<{ pack: BlogContextPack; references: BlogReferenceItem[] }> {
  const helpArticles = await chooseRelevantHelpArticles(brief, config.textModel);
  const officialSources = getOfficialSourceReferences(brief.cluster);
  const snapshots: BlogSourceSnapshot[] = [];

  for (const article of helpArticles) {
    snapshots.push(await createSourceSnapshot({
      sourceType: "help-article",
      sourceKey: article.sourceKey,
      title: article.title,
      sourceUrl: article.url,
      domain: "agentezap.online",
      excerpt: article.description,
      summary: article.content.slice(0, 4000),
      payload: {
        categoryId: article.categoryId,
        articleId: article.articleId,
      },
    }));
  }

  snapshots.push(await createSourceSnapshot({
    sourceType: "product-proof",
    sourceKey: `proofs:${brief.cluster}`,
    title: `Provas internas ${brief.cluster}`,
    sourceUrl: `${config.baseUrl}${getHelpLinkForCategory(brief.categorySlug)}`,
    domain: "agentezap.online",
    excerpt: brief.internalProofs.join(" "),
    summary: brief.internalProofs.join("\n"),
    payload: { proofs: brief.internalProofs },
  }));

  snapshots.push(await createSourceSnapshot({
    sourceType: "search-console",
    sourceKey: `query:${brief.keywordPrimary}`,
    title: `Sinal Search Console ${brief.keywordPrimary}`,
    excerpt: brief.sourceSummary,
    summary: brief.sourceSummary,
    payload: { sourceSummary: brief.sourceSummary },
  }));

  for (const reference of officialSources) {
    snapshots.push(await createSourceSnapshot({
      sourceType: reference.sourceType,
      sourceKey: reference.href,
      title: reference.label,
      sourceUrl: reference.href,
      domain: new URL(reference.href).hostname,
      excerpt: reference.description || null,
      summary: reference.description || reference.label,
      payload: reference as unknown as Record<string, unknown>,
    }));
  }

  const relatedTitles = existingPosts
    .filter((item) => item.cluster === brief.cluster || item.categorySlug === brief.categorySlug)
    .slice(0, 5)
    .map((item) => item.title);

  const packDraft = await callBlogJsonTask({
    taskName: "context-pack",
    model: config.textModel,
    schema: contextPackSchema,
    prompt: "VocÃª monta um context pack curto para redator SEO people-first. Use as fontes para orientar estrutura, provas internas e Ã¢ngulo do artigo.",
    userMessage: JSON.stringify({
      keywordPrimary: brief.keywordPrimary,
      titleHint: brief.titleHint,
      problem: brief.problem,
      internalProofs: brief.internalProofs,
      sources: snapshots.map((snapshot) => ({
        title: snapshot.title,
        sourceType: snapshot.sourceType,
        summary: snapshot.summary,
      })),
      relatedTitles,
    }),
  });

  const [pack] = await db.insert(blogContextPacks).values({
    topicId: topic.id,
    packType: "editorial",
    keywordPrimary: brief.keywordPrimary,
    cluster: brief.cluster,
    summary: packDraft.summary,
    outline: packDraft.outline as unknown as Array<Record<string, unknown>>,
    sourceSnapshotIds: snapshots.map((snapshot) => snapshot.id),
    internalNotes: {
      relatedTitles,
      helpArticleIds: helpArticles.map((item) => item.articleId),
    },
  }).returning();

  const references: BlogReferenceItem[] = [
    ...helpArticles.map((article) => ({
      label: article.title,
      href: article.url,
      sourceType: "help-article",
      description: article.description,
    })),
    ...officialSources,
  ];

  return { pack, references };
}

function getFirstPartyDiscoverySeeds() {
  const helpSeeds = HELP_CATEGORIES_META.slice(0, 8).map((category) => ({
    keyword: `como usar ${category.title.toLowerCase()} no whatsapp`,
    title: `${category.title}: como aplicar no atendimento pelo WhatsApp`,
    cluster: "ia-whatsapp",
    category: "ia-whatsapp",
    intent: "informational" as BlogIntent,
    funnel: "mofu" as FunnelStage,
  }));

  return [...DISCOVERY_SEEDS, ...helpSeeds];
}

function countMojibakeMarkers(value: string): number {
  const markers = ["Ã", "Â", "â", "ðŸ", "�"];
  return markers.reduce((total, marker) => total + (value.includes(marker) ? 1 : 0), 0);
}

function repairMojibake(value: string): string {
  const text = String(value || "");
  if (!text.trim()) return text;
  const currentScore = countMojibakeMarkers(text);
  if (currentScore === 0) return text;

  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    return countMojibakeMarkers(repaired) < currentScore ? repaired : text;
  } catch {
    return text;
  }
}

async function resolveBlogConfig(): Promise<BlogConfig> {
  const values = await storage.getSystemConfigs([...BLOG_SYSTEM_CONFIG_KEYS]);
  const envJson = process.env.BLOG_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null;

  return {
    baseUrl: values.get("blog_base_url") || process.env.BLOG_BASE_URL || DEFAULT_BASE_URL,
    brandName: values.get("blog_brand_name") || process.env.BLOG_BRAND_NAME || "AgenteZap",
    authorName: repairMojibake(values.get("blog_author_name") || process.env.BLOG_AUTHOR_NAME || "Editorial AgenteZap"),
    authorRole: repairMojibake(values.get("blog_author_role") || process.env.BLOG_AUTHOR_ROLE || "Time de produto"),
    authorUrl: values.get("blog_author_url") || process.env.BLOG_AUTHOR_URL || DEFAULT_BASE_URL,
    authorBio: repairMojibake(values.get("blog_author_bio") || process.env.BLOG_AUTHOR_BIO || "Especialista em operação comercial, IA aplicada ao WhatsApp e automação de atendimento."),
    authorAvatarUrl: values.get("blog_author_avatar_url") || process.env.BLOG_AUTHOR_AVATAR_URL || null,
    methodologySlug: values.get("blog_methodology_slug") || process.env.BLOG_METHODOLOGY_SLUG || "metodologia-editorial",
    textModel: values.get("blog_mistral_text_model") || process.env.BLOG_MISTRAL_TEXT_MODEL || "mistral-medium-latest",
    searchConsoleSiteUrl: values.get("blog_search_console_site_url") || process.env.BLOG_SEARCH_CONSOLE_SITE_URL || DEFAULT_BASE_URL,
    serviceAccountJson: values.get("blog_search_console_service_account_json") || envJson,
    serviceAccountClientEmail: values.get("blog_search_console_client_email") || process.env.BLOG_SEARCH_CONSOLE_CLIENT_EMAIL || null,
    serviceAccountPrivateKey: values.get("blog_search_console_private_key") || process.env.BLOG_SEARCH_CONSOLE_PRIVATE_KEY || null,
    nvidiaApiKey: values.get("blog_nvidia_api_key") || values.get("nvidia_api_key") || process.env.BLOG_NVIDIA_API_KEY || process.env.NVIDIA_API_KEY || null,
    nvidiaImageModel: values.get("blog_nvidia_image_model") || process.env.BLOG_NVIDIA_IMAGE_MODEL || "black-forest-labs/flux.1-schnell",
    nvidiaImageFallbackModel: values.get("blog_nvidia_image_fallback_model") || process.env.BLOG_NVIDIA_IMAGE_FALLBACK_MODEL || "",
    hfApiToken: values.get("blog_hf_api_token") || process.env.HF_TOKEN || null,
    hfImageModel: values.get("blog_hf_image_model") || process.env.BLOG_HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell",
    publishEnabled: parseBoolean(values.get("blog_publish_enabled") || process.env.BLOG_PUBLISH_ENABLED, true),
    discoveryEnabled: parseBoolean(values.get("blog_discovery_enabled") || process.env.BLOG_DISCOVERY_ENABLED, true),
    refreshEnabled: parseBoolean(values.get("blog_refresh_enabled") || process.env.BLOG_REFRESH_ENABLED, true),
    autoApproveEnabled: parseBoolean(values.get("blog_auto_approve_enabled") || process.env.BLOG_AUTO_APPROVE_ENABLED, true),
    autoPublishEnabled: parseBoolean(values.get("blog_auto_publish_enabled") || process.env.BLOG_AUTO_PUBLISH_ENABLED, true),
    publishMaxPerDay: parsePositiveInt(values.get("blog_publish_max_per_day") || process.env.BLOG_PUBLISH_MAX_PER_DAY, 10, { min: 1, max: 24 }),
    publishMinHoursBetween: parsePositiveInt(values.get("blog_publish_min_hours_between") || process.env.BLOG_PUBLISH_MIN_HOURS_BETWEEN, 1, { min: 1, max: 24 }),
    publishMaxClusterPerWeek: parsePositiveInt(values.get("blog_publish_max_cluster_per_week") || process.env.BLOG_PUBLISH_MAX_CLUSTER_PER_WEEK, 4, { min: 1, max: 14 }),
    autoRewriteAttempts: parsePositiveInt(values.get("blog_auto_rewrite_attempts") || process.env.BLOG_AUTO_REWRITE_ATTEMPTS, 10, { min: 1, max: 10 }),
  };
}

export async function updateBlogAutomationSettings(input: Partial<{
  publishEnabled: boolean;
  discoveryEnabled: boolean;
  refreshEnabled: boolean;
  autoApproveEnabled: boolean;
  autoPublishEnabled: boolean;
  publishMaxPerDay: number;
  publishMinHoursBetween: number;
  publishMaxClusterPerWeek: number;
  autoRewriteAttempts: number;
}>): Promise<BlogConfig> {
  const mappings: Array<[keyof typeof input, string]> = [
    ["publishEnabled", "blog_publish_enabled"],
    ["discoveryEnabled", "blog_discovery_enabled"],
    ["refreshEnabled", "blog_refresh_enabled"],
    ["autoApproveEnabled", "blog_auto_approve_enabled"],
    ["autoPublishEnabled", "blog_auto_publish_enabled"],
  ];

  for (const [property, configKey] of mappings) {
    if (typeof input[property] === "boolean") {
      await storage.updateSystemConfig(configKey, input[property] ? "true" : "false");
    }
  }

  const numericMappings: Array<[keyof typeof input, string, number]> = [
    ["publishMaxPerDay", "blog_publish_max_per_day", 10],
    ["publishMinHoursBetween", "blog_publish_min_hours_between", 1],
    ["publishMaxClusterPerWeek", "blog_publish_max_cluster_per_week", 4],
    ["autoRewriteAttempts", "blog_auto_rewrite_attempts", 10],
  ];

  for (const [property, configKey, fallback] of numericMappings) {
    if (typeof input[property] === "number" && Number.isFinite(input[property])) {
      await storage.updateSystemConfig(configKey, String(Math.max(1, Math.round(input[property] || fallback))));
    }
  }

  return resolveBlogConfig();
}

async function ensureBlogAssetDir(): Promise<void> {
  await fs.mkdir(BLOG_ASSET_DIR, { recursive: true });
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

async function ensureBlogStorageBucket(): Promise<void> {
  if (ensureBlogStorageBucketPromise) {
    return ensureBlogStorageBucketPromise;
  }

  ensureBlogStorageBucketPromise = (async () => {
    const supabase = createSupabaseServiceClient();
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      throw new Error(`Falha ao listar buckets do Supabase: ${listError.message}`);
    }

    const existingBucket = buckets?.find((bucket) => bucket.id === BLOG_STORAGE_BUCKET || bucket.name === BLOG_STORAGE_BUCKET);
    if (existingBucket) {
      return;
    }

    const { error: createError } = await supabase.storage.createBucket(BLOG_STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
    });

    if (createError && !createError.message.toLowerCase().includes("already")) {
      throw new Error(`Falha ao criar bucket ${BLOG_STORAGE_BUCKET}: ${createError.message}`);
    }
  })().catch((error) => {
    ensureBlogStorageBucketPromise = null;
    throw error;
  });

  return ensureBlogStorageBucketPromise;
}

async function uploadBlogAssetToStorage(fileName: string, content: Buffer, mimeType: string) {
  await ensureBlogStorageBucket();
  const supabase = createSupabaseServiceClient();
  const objectPath = `posts/${fileName}`;

  const { error: uploadError } = await supabase.storage.from(BLOG_STORAGE_BUCKET).upload(objectPath, content, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: true,
  });

  if (uploadError) {
    throw new Error(`Falha no upload do asset do blog: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(BLOG_STORAGE_BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error(`Bucket ${BLOG_STORAGE_BUCKET} nao retornou URL publica para ${objectPath}`);
  }

  return {
    bucket: BLOG_STORAGE_BUCKET,
    objectPath,
    publicUrl: data.publicUrl,
  };
}

function getAssetPublishabilityIssue(asset: BlogAssetImage | null): string | null {
  if (!asset) {
    return "Nenhum asset de imagem foi encontrado para o post.";
  }

  const provenance = readRecord(asset.sourceProvenance);
  const storageInfo = readRecord(provenance?.storage);
  if (!isBlogPublishableImageAsset({
    provider: asset.provider,
    publicUrl: asset.publicUrl,
    sourceProvenance: provenance,
  })) {
    if (asset.provider === "template") {
      return "O asset atual e apenas um fallback vetorial local.";
    }
    if (storageInfo?.provider !== "supabase") {
      const uploadError = typeof storageInfo?.uploadError === "string" ? storageInfo.uploadError : null;
      return uploadError
        ? `A imagem existe, mas o upload publico falhou: ${uploadError}`
        : "A imagem existe, mas nao esta em storage publico duravel.";
    }
    return "A imagem atual nao atende os guardrails de publicacao.";
  }

  return null;
}

async function resolveSearchConsoleClient(config: BlogConfig) {
  try {
    let credentials: { client_email?: string; private_key?: string } | undefined;

    if (config.serviceAccountJson) {
      const parsed = JSON.parse(config.serviceAccountJson);
      credentials = {
        client_email: parsed.client_email,
        private_key: typeof parsed.private_key === "string"
          ? parsed.private_key.replace(/\\n/g, "\n")
          : parsed.private_key,
      };
    } else if (config.serviceAccountClientEmail && config.serviceAccountPrivateKey) {
      credentials = {
        client_email: config.serviceAccountClientEmail,
        private_key: config.serviceAccountPrivateKey.replace(/\\n/g, "\n"),
      };
    }

    if (!credentials?.client_email || !credentials.private_key || !config.searchConsoleSiteUrl) {
      return null;
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/webmasters",
        "https://www.googleapis.com/auth/webmasters.readonly",
      ],
    });

    return {
      client: google.searchconsole({ version: "v1", auth }),
      siteUrl: config.searchConsoleSiteUrl,
    };
  } catch (error) {
    console.error("[BLOG] Falha ao resolver Search Console:", error);
    return null;
  }
}

async function createGenerationJob(jobType: string, topicId?: string | null, postId?: string | null) {
  const [job] = await db.insert(blogGenerationJobs).values({
    jobType,
    topicId: topicId || null,
    postId: postId || null,
    status: "running",
    startedAt: new Date(),
    provider: "mistral",
  }).returning();
  return job;
}

async function finishGenerationJob(jobId: string, status: string, payload: Record<string, unknown>, errorMessage?: string) {
  await db.update(blogGenerationJobs)
    .set({
      status,
      responsePayload: payload,
      errorMessage: errorMessage || null,
      completedAt: new Date(),
    })
    .where(eq(blogGenerationJobs.id, jobId));
}

async function createPublishJob(postId: string, payload: Record<string, unknown>) {
  const [job] = await db.insert(blogPublishJobs).values({
    postId,
    jobType: "publish",
    status: "queued",
    payload,
  }).returning();
  return job;
}

async function finishPublishJob(jobId: string, status: string, payload: Record<string, unknown>, errorMessage?: string) {
  await db.update(blogPublishJobs)
    .set({
      status,
      payload,
      errorMessage: errorMessage || null,
      executedAt: new Date(),
    })
    .where(eq(blogPublishJobs.id, jobId));
}

function buildBriefFromCandidate(candidate: {
  keyword: string;
  title: string;
  cluster: string;
  category: string;
  intent: BlogIntent;
  funnel: FunnelStage;
  sourceSummary: string;
}): BlogBrief {
  return {
    titleHint: candidate.title,
    keywordPrimary: candidate.keyword,
    keywordsSecondary: [
      `${candidate.keyword} no brasil`,
      `como implementar ${candidate.keyword}`,
      `software para ${candidate.keyword}`,
    ],
    cluster: candidate.cluster,
    categorySlug: candidate.category,
    intent: candidate.intent,
    funnelStage: candidate.funnel,
    audience: "donos de negocio, operacao comercial e atendimento que dependem do WhatsApp",
    problem: `Entender como ${candidate.keyword} pode gerar atendimento util, captacao e conversao sem criar operacao manual demais.`,
    ctaUrl: "/cadastro",
    ctaLabel: "Criar conta gratis",
    internalProofs: getClusterProofs(candidate.cluster),
    sourceSummary: candidate.sourceSummary,
  };
}

function fallbackDraftFromBrief(brief: BlogBrief): BlogDraft {
  const clusterExamples: Record<string, { angles: string[]; metrics: string[]; mistakes: string[] }> = {
    "ia-whatsapp": {
      angles: [
        "mapear perguntas repetidas antes de ligar o agente",
        "definir quando o atendimento humano deve assumir",
        "usar a IA para qualificar e nao so responder",
      ],
      metrics: ["tempo ate primeira resposta", "leads qualificados por dia", "conversas que exigem transbordo humano"],
      mistakes: ["ligar a IA sem base de respostas reais", "deixar o agente prometer algo que o time nao entrega"],
    },
    "automacao-whatsapp": {
      angles: [
        "separar automacao de resposta da automacao de follow-up",
        "registrar contexto antes de disparar nova mensagem",
        "medir gargalos por etapa do atendimento",
      ],
      metrics: ["tempo medio de retomada", "conversas abandonadas", "etapas do funil sem resposta"],
      mistakes: ["automatizar tudo igual para todos os contatos", "disparar mensagens sem contexto da ultima conversa"],
    },
    "crm-whatsapp": {
      angles: [
        "centralizar historico, etiquetas e responsavel da conversa",
        "amarrar atendimento com funil comercial",
        "evitar perder contexto entre equipe e automacao",
      ],
      metrics: ["leads sem dono", "tempo entre primeiro contato e proposta", "negocios sem proximo passo"],
      mistakes: ["usar WhatsApp sem campo de contexto", "deixar comercial e atendimento em ferramentas separadas"],
    },
    "agendamento-whatsapp": {
      angles: [
        "confirmar regras de agenda antes de automatizar",
        "encurtar o caminho ate o horario confirmado",
        "usar lembretes para reduzir faltas",
      ],
      metrics: ["taxa de faltas", "tempo ate confirmar horario", "reagendamentos por semana"],
      mistakes: ["automatizar sem excecoes de agenda", "nao registrar servico, profissional e horario no mesmo fluxo"],
    },
  };
  const clusterSignals = clusterExamples[brief.cluster] || {
    angles: ["traduzir o problema da busca para o fluxo real do time", "ligar prova do produto a decisao de compra", "mostrar como medir se a mudanca funcionou"],
    metrics: ["tempo de resposta", "conversas sem proximo passo", "taxa de recuperacao de leads"],
    mistakes: ["publicar promessa ampla demais", "escrever um texto que serve para qualquer ferramenta"],
  };

  return {
    title: brief.titleHint,
    excerpt: `Entenda onde ${brief.keywordPrimary} realmente ajuda, quais erros mais travam a operacao e como transformar o WhatsApp em um fluxo comercial mais previsivel.`,
    metaTitle: `${brief.titleHint} | AgenteZap`,
    metaDescription: `Guia pratico sobre ${brief.keywordPrimary}, com foco em operacao real, criterios de implementacao e sinais para decidir se faz sentido no seu negocio.`,
    categorySlug: brief.categorySlug,
    tags: [brief.cluster, "whatsapp", "ia"],
    cluster: brief.cluster,
    intent: brief.intent,
    funnelStage: brief.funnelStage,
    keywordPrimary: brief.keywordPrimary,
    keywordsSecondary: brief.keywordsSecondary,
    imagePrompt: `Ilustracao editorial clean sobre ${brief.keywordPrimary}, smartphone com interface de conversa, atmosfera profissional, sem texto grande na arte.`,
    internalProofs: brief.internalProofs.slice(0, 3),
    sections: [
      {
        heading: "Qual problema essa busca esta tentando resolver",
        paragraphs: [
          `Quem pesquisa ${brief.keywordPrimary} quase sempre ja percebeu um gargalo concreto no atendimento: demora, perda de contexto, follow-up esquecido ou falta de visibilidade comercial.`,
          `O ponto central nao e "automatizar por automatizar". E remover atrito em etapas especificas do fluxo, como ${clusterSignals.angles[0]}, ${clusterSignals.angles[1]} e ${clusterSignals.angles[2]}.`,
        ],
        bullets: [
          "Mapeie o gargalo exato antes de desenhar o fluxo.",
          "Identifique qual etapa pede automacao e qual etapa pede criterio humano.",
          "Evite tratar toda conversa como se tivesse a mesma intencao.",
        ],
      },
      {
        heading: "Como avaliar se isso faz sentido no seu negocio",
        paragraphs: [
          `A melhor forma de decidir passa por tres perguntas: onde a conversa trava hoje, que dado precisa acompanhar o contato e em que momento o humano precisa assumir.`,
          `Quando a operacao junta historico, automacao, regras de transbordo e CRM no mesmo fluxo do WhatsApp, ${brief.keywordPrimary} deixa de ser uma promessa de marketing e vira processo repetivel.`,
        ],
        bullets: [
          `Mapeie os pontos em que o time perde ${clusterSignals.metrics[0]}.`,
          `Defina que informacoes precisam ser registradas antes da proxima etapa comercial.`,
          "Separe o que o sistema pode resolver sozinho do que exige atendimento humano.",
        ],
        proof: brief.internalProofs.slice(0, 3),
      },
      {
        heading: "Um exemplo de operacao que tende a funcionar melhor",
        paragraphs: [
          `Um desenho mais seguro costuma começar pela triagem, passar pela organizacao do contexto e deixar a decisao comercial mais sensivel para o humano.`,
          "Esse tipo de implementacao reduz repeticao e acelera o proximo passo sem deixar o contato preso em respostas bonitas, mas vazias.",
        ],
        bullets: [
          "A IA coleta o basico e organiza o contexto.",
          "O sistema registra o que o time precisa saber antes do handoff.",
          "O humano assume quando a conversa pede excecao, negociacao ou fechamento.",
        ],
      },
      {
        heading: "Sinais prÃ¡ticos de que a implementaÃ§Ã£o estÃ¡ funcionando",
        paragraphs: [
          `Antes de escalar, acompanhe indicadores simples como ${clusterSignals.metrics.join(", ")}.`,
          "Esses sinais mostram se o sistema esta reduzindo atrito de verdade ou so criando mais mensagens sem relevancia para o contato.",
        ],
        bullets: [
          "Centralizar historico, contexto e proximo passo da conversa.",
          "Garantir um caminho claro para o humano assumir quando a IA nao deve insistir.",
          "Medir se a automacao esta levando a conversa para agenda, proposta, venda ou recuperacao do lead.",
        ],
      },
      {
        heading: "Erros que fazem esse tipo de projeto parecer bom no papel e ruim na pratica",
        paragraphs: [
          "Muitos projetos falham nao pela ferramenta em si, mas por sair publicando automacao antes de definir regra, contexto e criterio de handoff.",
          `Os erros mais comuns aqui costumam ser ${clusterSignals.mistakes[0]} e ${clusterSignals.mistakes[1]}.`,
        ],
        bullets: [
          "Prometer automatizacao completa sem regra de excecao.",
          "Criar fluxo bonito no papel, mas sem dono e sem metricas.",
          "Ignorar o momento em que o contato precisa falar com alguem do time.",
        ],
      },
      {
        heading: "Quando nao automatizar e deixar o humano assumir mais cedo",
        paragraphs: [
          "Se a conversa depende de proposta sob medida, avaliacao tecnica, agenda complexa ou negociacao delicada, insistir na IA por tempo demais costuma piorar a experiencia.",
          "O melhor uso do sistema e acelerar o basico, proteger o contexto e fazer o humano entrar mais preparado, nao mais tarde.",
        ],
        bullets: [
          "Negociacao e excecao operacional pedem humano.",
          "Cliente travado em duvida critica pede intervencao humana.",
          "Se a automacao so aumenta mensagem e nao move o funil, o desenho precisa mudar.",
        ],
      },
    ],
    faq: [
      {
        question: `Vale a pena usar ${brief.keywordPrimary}?`,
        answer: "Vale quando existe um gargalo claro no fluxo de atendimento ou venda e quando o time consegue definir o que automatizar, o que medir e quando o humano deve assumir.",
      },
      {
        question: "Qual o melhor jeito de comecar?",
        answer: "Comece por uma etapa especifica da conversa, como qualificar, agendar, retomar ou registrar contexto, em vez de tentar automatizar tudo de uma vez.",
      },
      {
        question: "Quando o humano deve entrar cedo no fluxo?",
        answer: "Quando a conversa pede excecao, proposta sob medida, negociacao ou validacao que nao cabe em uma resposta padronizada.",
      },
    ],
    ctaLabel: brief.ctaLabel,
    ctaUrl: brief.ctaUrl,
  };
}

function normalizeBlogDraft(draft: BlogDraft, brief: BlogBrief): BlogDraft {
  const normalized = draft;
  const fallback = fallbackDraftFromBrief(brief);
  normalized.title = normalizeWhitespace(normalized.title || brief.titleHint);
  normalized.excerpt = normalizeWhitespace(normalized.excerpt || `Guia pratico sobre ${brief.keywordPrimary}.`);
  normalized.metaTitle = normalizeWhitespace(normalized.metaTitle || `${normalized.title} | AgenteZap`);
  normalized.metaDescription = normalizeWhitespace(normalized.metaDescription || normalized.excerpt);
  normalized.categorySlug = slugify(normalized.categorySlug || brief.categorySlug);
  normalized.cluster = slugify(normalized.cluster || brief.cluster);
  normalized.intent = normalized.intent || brief.intent;
  normalized.funnelStage = normalized.funnelStage || brief.funnelStage;
  normalized.keywordPrimary = normalizeWhitespace(normalized.keywordPrimary || brief.keywordPrimary);
  normalized.keywordsSecondary = Array.isArray(normalized.keywordsSecondary) ? normalized.keywordsSecondary.slice(0, 4) : brief.keywordsSecondary.slice(0, 4);
  normalized.tags = Array.isArray(normalized.tags) ? normalized.tags.map((item) => slugify(String(item))).filter(Boolean).slice(0, 5) : [brief.cluster];
  normalized.internalProofs = Array.isArray(normalized.internalProofs) ? normalized.internalProofs.filter(Boolean) : brief.internalProofs.slice(0, 3);
  normalized.sections = Array.isArray(normalized.sections) ? normalized.sections.filter(Boolean).slice(0, 5) : [];
  normalized.faq = Array.isArray(normalized.faq) ? normalized.faq.filter(Boolean).slice(0, 3) : [];
  normalized.ctaLabel = normalized.ctaLabel || brief.ctaLabel;
  normalized.ctaUrl = normalized.ctaUrl || brief.ctaUrl;
  normalized.imagePrompt = normalizeWhitespace(normalized.imagePrompt || `Ilustracao editorial clean sobre ${brief.keywordPrimary}.`);
  if (normalized.excerpt.startsWith("Veja como ")) {
    normalized.excerpt = fallback.excerpt;
  }
  if (normalized.metaDescription.startsWith("Veja como ")) {
    normalized.metaDescription = fallback.metaDescription;
  }
  normalized.excerpt = normalized.excerpt.slice(0, 180);
  normalized.metaDescription = normalized.metaDescription.slice(0, 160);
  return normalized;
}

async function refineDraftWithMistral(input: {
  draft: BlogDraft;
  brief: BlogBrief;
  config: BlogConfig;
  contextPack?: BlogContextPack | null;
  references?: BlogReferenceItem[];
  mode: "generation" | "revision";
}): Promise<BlogDraft> {
  const prompt = `
Voce faz a normalizacao editorial final de um rascunho de blog da marca ${input.config.brandName}.

Objetivo:
- manter a keyword principal, a tese e o foco comercial
- remover sinais de conteudo escalado, genÃ©rico ou reaproveitavel para qualquer SaaS
- limpar numeros, casos, percentuais, integracoes e promessas que nao estejam sustentados no contexto
- devolver um JSON final humano, denso, legivel e pronto para o quality gate

Regras:
- pt-BR
- sem markdown, sem negrito, sem links em markdown, sem cercas de codigo
- preserve apenas fatos que estejam apoiados pelo brief, pelas provas internas ou pelas referencias fornecidas
- se houver numero, percentual, estudo, caso real, integracao ou pagina especifica sem sustentacao clara, remova ou reescreva de forma qualitativa
- escreva como um operador experiente aconselhando outro operador, nao como um redator tentando impressionar
- evite abrir varios paragrafos com a mesma formula como "alem disso", "outro ponto" ou "e importante"; varie a cadencia
- se citar beneficio, explique a condicao para ele acontecer ou o risco de executar errado
- mantenha exatamente 5 secoes e 3 FAQ
- cada secao deve ter 2 ou 3 paragrafos, com frases claras e naturais
- uma secao precisa trazer um exemplo operacional plausivel
- uma secao precisa explicar quando nao automatizar ou quando o humano assume
- bullets e proof devem ser arrays de strings curtas; nao use objetos
- nao adicione campos extras
- no maximo 5 tags e 4 keywordsSecondary
- excerpt com no maximo 180 caracteres; metaDescription com no maximo 160 caracteres
- imagePrompt em uma frase curta

JSON esperado:
${BLOG_DRAFT_JSON_SHAPE}
`;

  const userMessage = JSON.stringify({
    mode: input.mode,
    brief: input.brief,
    contextPackSummary: input.contextPack?.summary || "",
    references: (input.references || []).map((item) => ({
      label: item.label,
      href: item.href,
      description: item.description || "",
      sourceType: item.sourceType,
    })),
    draft: input.draft,
  });

  return callBlogJsonTask({
    taskName: `blog-draft-refine-${input.mode}`,
    prompt,
    userMessage,
    schema: blogDraftSchema,
    model: input.config.textModel,
    maxTokens: 2600,
    temperature: 0.15,
    repairHint: BLOG_DRAFT_JSON_SHAPE,
  }).catch(() => input.draft);
}

async function generateDraftWithMistral(brief: BlogBrief, config: BlogConfig, contextPack?: BlogContextPack | null, references?: BlogReferenceItem[]): Promise<BlogDraft> {
  const prompt = `
VocÃª escreve artigos de blog SEO para a marca ${config.brandName}.

Objetivo:
- responder a busca principal com clareza
- manter tom pragmatico, tecnico e comercial
- focar em WhatsApp, IA, CRM, automacao e operacao real
- evitar fluff, jargao vazio e promessas absolutas
- incluir provas do proprio produto, nao copiar SERP
- produzir um artigo especifico o suficiente para nao servir em qualquer outro SaaS apenas trocando a keyword
- criar densidade editorial que ajude indexacao, sem parecer texto inflado
- soar como uma pessoa que opera atendimento, vendas e implementacao de verdade

Regras:
- idioma: pt-BR
- nao use markdown
- nao invente dados numericos, clientes ou estudos de caso
- inclua pelo menos 3 provas internas do produto
- crie exatamente 5 secoes
- gere exatamente 3 FAQ reais
- CTA final apontando para ${brief.ctaUrl}
- uma secao deve explicar quando a estrategia nao e boa ideia ou quando exige atendimento humano
- uma secao deve trazer criterios praticos de decisao ou implementacao
- uma secao deve mostrar erros comuns ou tradeoffs
- uma secao deve trazer um exemplo operacional ou cenario plausivel
- escreva como alguem que ja viu a operacao quebrar na pratica e agora explica como evitar isso
- cada secao precisa de um angulo proprio; evite repetir a mesma tese com outra palavra
- evite introducoes genÃ©ricas como "quando o volume cresce" se isso nao estiver conectado a um gargalo concreto
- se o texto puder ser reaproveitado em outra keyword sem mudar o raciocinio central, reescreva
- profundidade minima: 2 ou 3 paragrafos por secao, com linguagem humana e especifica
- evite blocos de slogan, frases de marketing e conclusoes ocas
- inclua perguntas e objecoes que um comprador real faria antes de contratar
- evite repetir muletas como "alem disso", "por outro lado", "nesse sentido" em varios paragrafos seguidos
- bullets e proof devem ser arrays de strings curtas; nao use objetos nesses campos
- nao use negrito, cercas de codigo, markdown, links em markdown ou campos extras
- se nao houver dado numerico comprovado no brief, nao invente percentuais, volumes ou estudos
- no maximo 5 tags e 4 keywordsSecondary
- excerpt com no maximo 180 caracteres; metaDescription com no maximo 160 caracteres
- imagePrompt em uma frase curta
- retorne apenas JSON valido

JSON esperado:
${BLOG_DRAFT_JSON_SHAPE}
`;

  const userMessage = `
Brief:
- keyword principal: ${brief.keywordPrimary}
- titulo sugerido: ${brief.titleHint}
- cluster: ${brief.cluster}
- categoria: ${brief.categorySlug}
- intencao: ${brief.intent}
- funil: ${brief.funnelStage}
- publico: ${brief.audience}
- problema: ${brief.problem}
- CTA: ${brief.ctaLabel} -> ${brief.ctaUrl}
- provas internas obrigatorias:
${brief.internalProofs.map((proof) => `  - ${proof}`).join("\n")}
- contexto da pauta:
${brief.sourceSummary}
- context pack resumido:
${contextPack?.summary || "Sem context pack consolidado"}
- referencias oficiais e internas:
${(references || []).map((item) => `  - ${item.label}: ${item.href}`).join("\n")}
- exemplos internos de estilo editorial:
${formatEditorialExamplesForPrompt(brief.cluster)}
- resultado esperado:
  - artigo people-first, com sinais claros de experiencia de produto
  - diferencas, friccoes e decisoes reais da operacao
  - menos "beneficios amplos", mais "como decidir", "como implementar" e "como medir"
`;

  const draft = await callBlogJsonTask({
    taskName: "blog-draft-generation",
    prompt,
    userMessage,
    schema: blogDraftSchema,
    model: config.textModel,
    maxTokens: 3200,
    temperature: 0.45,
    repairHint: BLOG_DRAFT_JSON_SHAPE,
  });

  const refinedDraft = await refineDraftWithMistral({
    draft: normalizeBlogDraft(draft, brief),
    brief,
    config,
    contextPack,
    references,
    mode: "generation",
  });

  return normalizeBlogDraft(refinedDraft, brief);
}

function buildBriefFromPost(post: BlogPost): BlogBrief {
  const provenance = typeof post.sourceProvenance === "object" && post.sourceProvenance
    ? post.sourceProvenance as Record<string, unknown>
    : {};

  return {
    titleHint: post.title,
    keywordPrimary: post.keywordPrimary,
    keywordsSecondary: Array.isArray(post.keywordsSecondary) ? post.keywordsSecondary : [],
    cluster: post.cluster,
    categorySlug: post.categorySlug,
    intent: post.intent as BlogIntent,
    funnelStage: post.funnelStage as FunnelStage,
    audience: "gestores, vendedores e operacao de atendimento que usam WhatsApp como canal principal",
    problem: `Melhorar a qualidade editorial e a relevancia comercial do tema ${post.keywordPrimary}.`,
    ctaUrl: "/cadastro",
    ctaLabel: "Criar conta gratis",
    internalProofs: normalizeDraftFromStoredPost(post).internalProofs,
    sourceSummary: String(provenance.sourceSummary || `Refresh editorial do artigo ${post.title}`),
  };
}

function buildAutoblogRepairInstruction(input: {
  draft: BlogDraft;
  gate: QualityGateResult;
  approval: ReturnType<typeof buildPostApprovalPayload>["approval"];
  attempt: number;
}): string {
  const issues = [
    ...input.approval.blockingReasons,
    ...input.gate.notes,
    ...input.gate.factualIssues,
    ...input.gate.seoIssues,
    ...input.gate.styleIssues,
    ...input.gate.suggestedFixes,
  ].filter(Boolean);

  return [
    `Tentativa automatica ${input.attempt}.`,
    "Reescreva o artigo para ficar digno de publicacao automatica.",
    "Deixe o texto mais humano, util, especifico e orientado a decisao.",
    "Corte qualquer parte que pareca template, beneficio amplo ou promessa vazia.",
    `A meta minima e ultrapassar ${BLOG_MIN_WORD_COUNT} palavras sem inflar com repeticao.`,
    "Varie a abertura dos paragrafos e evite repetir conectores como 'alem disso' e 'outro ponto'.",
    "Abertura, H2 e FAQ devem responder uma busca comercial real com exemplos operacionais.",
    issues.length > 0 ? `Corrija estes pontos: ${issues.slice(0, 10).join(" | ")}` : "Fortaleca prova interna, diferenciais e criterio de decisao.",
  ].join(" ");
}

async function repairDraftForQualityGate(input: {
  draft: BlogDraft;
  brief: BlogBrief;
  gate: QualityGateResult;
  approval: ReturnType<typeof buildPostApprovalPayload>["approval"];
  attempt: number;
  config: BlogConfig;
  contextPack?: BlogContextPack | null;
  references?: BlogReferenceItem[];
}): Promise<BlogDraft> {
  const prompt = `
Voce e um editor senior de produto, SEO e growth da marca ${input.config.brandName}.

Tarefa:
- reescrever um rascunho que falhou no gate automatico do autoblog
- manter o tema principal
- aumentar utilidade pratica, prova do produto, humanidade e diferenciacao
- responder apenas com JSON valido

Regras:
- pt-BR
- nada de texto generico que serviria para qualquer SaaS
- inclua criterio de decisao, implementacao, excecoes, erros comuns e limites
- preserve apenas fatos apoiados no contexto
- se nao der para sustentar uma afirmacao, reescreva de forma mais honesta
- mantenha exatamente 5 secoes e 3 FAQ
- cada secao deve ter 2 ou 3 paragrafos e ao menos um detalhe operacional concreto
- nao escreva como lista de beneficios de software; escreva como artigo editorial com julgamento, contexto e limite
- evite repetir conectores e construcoes previsiveis em varios paragrafos seguidos
- no maximo 5 tags e 4 keywordsSecondary
- excerpt com no maximo 180 caracteres; metaDescription com no maximo 160 caracteres
- imagePrompt em uma frase curta

JSON esperado:
${BLOG_DRAFT_JSON_SHAPE}
`;

  const userMessage = JSON.stringify({
    instruction: buildAutoblogRepairInstruction(input),
    currentDraft: input.draft,
    currentGate: input.gate,
    currentApproval: input.approval,
    brief: input.brief,
    contextPackSummary: input.contextPack?.summary || "",
    references: (input.references || []).map((item) => ({
      label: item.label,
      href: item.href,
      description: item.description || "",
      sourceType: item.sourceType,
    })),
    styleExamples: getEditorialModelExamples(input.brief.cluster, 2).map((item) => ({
      title: item.title,
      styleFocus: item.styleFocus,
    })),
  });

  const repaired = await callBlogJsonTask({
    taskName: `blog-draft-autofix-${input.attempt}`,
    prompt,
    userMessage,
    schema: blogDraftSchema,
    model: input.config.textModel,
    maxTokens: 3200,
    temperature: 0.25,
    repairHint: BLOG_DRAFT_JSON_SHAPE,
  }).catch(() => input.draft);

  const normalized = normalizeBlogDraft(repaired, input.brief);
  return refineDraftWithMistral({
    draft: normalized,
    brief: input.brief,
    config: input.config,
    contextPack: input.contextPack,
    references: input.references,
    mode: "revision",
  });
}

async function reviseDraftWithMistral(input: {
  post: BlogPost;
  instruction: string;
  config: BlogConfig;
  contextPack?: BlogContextPack | null;
  references?: BlogReferenceItem[];
}): Promise<BlogDraft> {
  const brief = buildBriefFromPost(input.post);
  const currentDraft = normalizeDraftFromStoredPost(input.post);
  const currentReview = typeof input.post.semanticReview === "object" && input.post.semanticReview
    ? input.post.semanticReview as Record<string, unknown>
    : {};

  const prompt = `
VocÃª Ã© um editor senior de SEO e produto da marca ${input.config.brandName}.

Tarefa:
- revisar um artigo jÃ¡ existente
- obedecer a instruÃ§Ã£o do editor humano
- corrigir sinais de conteÃºdo genÃ©rico, claims sem prova e SEO fraco
- manter foco people-first e comercial
- responder apenas com JSON vÃ¡lido no mesmo formato do rascunho original
- deixar o artigo mais humano, menos robÃ³tico e mais Ãºtil para quem estÃ¡ decidindo compra ou implementaÃ§Ã£o

Regras:
- pt-BR
- sem markdown
- nÃ£o invente nÃºmeros, estudos ou clientes
- preserve a tese principal do artigo
- melhore clareza, originalidade, links internos sugeridos no texto e CTA
- reduza sinais de conteudo escalado e texto generico que serviria para qualquer SaaS
- traga criterios praticos de decisao, implementacao, medicao, erros e limites da estrategia
- mantenha exatamente 5 secoes e 3 FAQ
- cada secao deve ter 2 ou 3 paragrafos e pelo menos um detalhe operacional concreto
- inclua ao menos um trecho que responda uma duvida real que o cliente faria antes de contratar
- quebre o ritmo mecanico do texto; varie a abertura dos paragrafos e escreva como quem ja viu a rotina por dentro
- evite repetir muletas como "alem disso", "por outro lado" e "nesse sentido" em varios paragrafos seguidos
- bullets e proof devem ser arrays de strings curtas; nao use objetos nesses campos
- nao use negrito, cercas de codigo, markdown, links em markdown ou campos extras
- se nao houver dado numerico comprovado no contexto, nao invente percentuais, volumes ou estudos
- no maximo 5 tags e 4 keywordsSecondary
- excerpt com no maximo 180 caracteres; metaDescription com no maximo 160 caracteres
- imagePrompt em uma frase curta

JSON esperado:
${BLOG_DRAFT_JSON_SHAPE}
`;

  const userMessage = JSON.stringify({
    instruction: input.instruction,
    currentDraft,
    currentReview,
    contextPackSummary: input.contextPack?.summary || "",
    references: (input.references || []).map((item) => ({ label: item.label, href: item.href, description: item.description || "" })),
    styleExamples: getEditorialModelExamples(brief.cluster, 2).map((item) => ({
      title: item.title,
      styleFocus: item.styleFocus,
    })),
    brief,
  });

  const draft = await callBlogJsonTask({
    taskName: "blog-draft-revision",
    prompt,
    userMessage,
    schema: blogDraftSchema,
    model: input.config.textModel,
    maxTokens: 3200,
    temperature: 0.35,
    repairHint: BLOG_DRAFT_JSON_SHAPE,
  });

  const refinedDraft = await refineDraftWithMistral({
    draft: normalizeBlogDraft(draft, brief),
    brief,
    config: input.config,
    contextPack: input.contextPack,
    references: input.references,
    mode: "revision",
  });

  return normalizeBlogDraft(refinedDraft, brief);
}

function buildInternalLinks(_baseUrl: string, draft: BlogDraft, existingPosts: Pick<BlogPost, "slug" | "title" | "cluster" | "categorySlug">[]): InternalLink[] {
  const sameCluster = existingPosts
    .filter((post) => post.cluster === draft.cluster)
    .slice(0, 3)
    .map<InternalLink>((post) => ({
      href: `/blog/${post.slug}`,
      label: post.title,
      kind: "blog",
    }));

  const sameCategory = existingPosts
    .filter((post) => post.categorySlug === draft.categorySlug && post.cluster !== draft.cluster)
    .slice(0, 2)
    .map<InternalLink>((post) => ({
      href: `/blog/${post.slug}`,
      label: post.title,
      kind: "blog",
    }));

  const links: InternalLink[] = [
    ...sameCluster,
    ...sameCategory,
    {
      href: getHelpLinkForCategory(draft.categorySlug),
      label: "Central de ajuda relacionada",
      kind: "help",
    },
    {
      href: `/blog/categoria/${draft.categorySlug}`,
      label: "Ver categoria relacionada",
      kind: "blog",
    },
    {
      href: "/blog",
      label: "Ver todos os artigos do blog",
      kind: "home",
    },
    ...(draft.tags[0] ? [{
      href: `/blog/tag/${draft.tags[0]}`,
      label: `Ver mais sobre ${draft.tags[0]}`,
      kind: "blog" as const,
    }] : []),
    {
      href: draft.ctaUrl || "/cadastro",
      label: draft.ctaLabel || "Criar conta gratis",
      kind: "cta",
    },
  ];

  const unique = new Map<string, InternalLink>();
  for (const link of links) {
    unique.set(link.href, link);
  }
  return Array.from(unique.values()).slice(0, 8);
}

function renderBodyHtml(draft: BlogDraft, internalLinks: InternalLink[]): string {
  const parts: string[] = [];

  for (const section of draft.sections) {
    parts.push(`<section class="blog-section">`);
    parts.push(`<h2 id="${escapeHtml(slugify(section.heading))}">${escapeHtml(section.heading)}</h2>`);
    for (const paragraph of section.paragraphs || []) {
      parts.push(`<p>${escapeHtml(paragraph)}</p>`);
    }
    if (section.proof && section.proof.length > 0) {
      parts.push(`<div class="blog-proof"><strong>Provas do produto</strong><ul>`);
      for (const proof of section.proof) {
        parts.push(`<li>${escapeHtml(proof)}</li>`);
      }
      parts.push(`</ul></div>`);
    }
    if (section.bullets && section.bullets.length > 0) {
      parts.push("<ul>");
      for (const bullet of section.bullets) {
        parts.push(`<li>${escapeHtml(bullet)}</li>`);
      }
      parts.push("</ul>");
    }
    parts.push(`</section>`);
  }

  parts.push(`<section class="blog-section blog-links"><h2>Leituras e proximos passos</h2><ul>`);
  for (const link of internalLinks) {
    parts.push(`<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`);
  }
  parts.push(`</ul></section>`);
  parts.push(
    `<section class="blog-cta"><h2>Quer aplicar isso no seu WhatsApp?</h2><p>O AgenteZap junta agente IA, CRM, automacao e operacao em um unico fluxo.</p><a class="cta-button" href="${escapeHtml(draft.ctaUrl || "/cadastro")}">${escapeHtml(draft.ctaLabel || "Criar conta gratis")}</a></section>`,
  );

  return parts.join("");
}

function normalizePublicAuthorSlug(slug: string | null | undefined): string {
  const normalized = slugify(String(slug || "").trim());
  return LEGACY_BLOG_AUTHOR_ALIASES[normalized] || normalized;
}

function buildArticleJsonLd(post: BlogPost, config: BlogConfig, faq: BlogFaqItem[], authorProfile?: BlogAuthorProfile | null) {
  const canonicalUrl = post.canonicalUrl;
  const authorSlug = authorProfile?.slug || normalizePublicAuthorSlug(post.authorSlug) || slugify(config.authorName);
  const authorExpertise = Array.isArray(authorProfile?.expertise) ? authorProfile?.expertise : [];
  const payload: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.metaDescription,
      datePublished: toDate(post.publishedAt)?.toISOString() || new Date().toISOString(),
      dateModified: toDate(post.updatedAt)?.toISOString() || new Date().toISOString(),
      author: {
        "@type": "Person",
        name: authorProfile?.name || config.authorName,
        url: authorProfile?.profileUrl || `${config.baseUrl}/blog/autor/${authorSlug}`,
        jobTitle: authorProfile?.role || config.authorRole,
        description: authorProfile?.bio || config.authorBio,
        worksFor: {
          "@type": "Organization",
          name: config.brandName,
          url: config.baseUrl,
        },
        knowsAbout: authorExpertise,
      },
      publisher: {
        "@type": "Organization",
        name: config.brandName,
        url: config.baseUrl,
      },
      mainEntityOfPage: canonicalUrl,
      articleSection: humanizeSlug(post.categorySlug),
      keywords: [post.keywordPrimary, ...(Array.isArray(post.keywordsSecondary) ? post.keywordsSecondary : [])].filter(Boolean).join(", "),
      image: collectPostImageUrls(post, config),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Blog", item: `${config.baseUrl}/blog` },
        { "@type": "ListItem", position: 2, name: humanizeSlug(post.categorySlug), item: `${config.baseUrl}/blog/categoria/${post.categorySlug}` },
        { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name: authorProfile?.name || config.authorName,
        jobTitle: authorProfile?.role || config.authorRole,
        description: authorProfile?.bio || config.authorBio,
        url: authorProfile?.profileUrl || `${config.baseUrl}/blog/autor/${authorSlug}`,
        worksFor: {
          "@type": "Organization",
          name: config.brandName,
          url: config.baseUrl,
        },
        knowsAbout: authorExpertise,
      },
    },
  ];

  return payload;
}

function buildFixtureAuthorProfiles(config: BlogConfig): BlogAuthorProfile[] {
  return getDefaultAuthorRoster(config).map((author, index) => {
    const slug = slugify(author.name);
    return {
      id: `fixture-author-${slug}`,
      slug,
      name: author.name,
      role: author.role,
      bio: author.bio,
      avatarUrl: buildAuthorAvatarDataUri(author.name),
      profileUrl: `${config.baseUrl}/blog/autor/${slug}`,
      expertise: author.expertise,
      metadata: { localFixture: true, company: config.brandName, employee: true, clusters: author.clusters },
      isDefault: index === 0,
      createdAt: new Date("2026-03-11T12:00:00.000Z"),
      updatedAt: new Date("2026-03-11T12:00:00.000Z"),
    } satisfies BlogAuthorProfile;
  });
}

function buildFixtureAuthorProfile(config: BlogConfig): BlogAuthorProfile {
  return buildFixtureAuthorProfiles(config)[0];
}

function formatEditorialExamplesForPrompt(cluster: string): string {
  return getEditorialModelExamples(cluster, 2)
    .map((item, index) => `${index + 1}. ${item.title} | foco: ${item.styleFocus.join(", ")}`)
    .join("\n");
}

function createFixturePublishedPosts(config: BlogConfig): BlogPost[] {
  const authors = buildFixtureAuthorProfiles(config);
  const seedDateBase = new Date("2026-03-11T12:00:00.000Z");

  const drafts = BLOG_EDITORIAL_MODEL_POSTS.map((seed, index) => {
    const publishedAt = new Date(seedDateBase.getTime() - index * 24 * 60 * 60 * 1000);
    const author = authors[index % authors.length];
    const draft: BlogDraft = {
      title: seed.title,
      excerpt: seed.excerpt,
      metaTitle: seed.metaTitle,
      metaDescription: seed.metaDescription,
      categorySlug: seed.categorySlug,
      tags: seed.tags,
      cluster: seed.cluster,
      intent: seed.intent,
      funnelStage: seed.funnelStage,
      keywordPrimary: seed.keywordPrimary,
      keywordsSecondary: seed.keywordsSecondary,
      imagePrompt: seed.imagePrompt,
      internalProofs: seed.internalProofs,
      sections: seed.sections.map((section) => ({
        heading: section.heading,
        paragraphs: section.paragraphs,
        bullets: section.bullets || [],
        proof: section.proof || [],
      })),
      faq: seed.faq,
      ctaLabel: "Criar conta gratis",
      ctaUrl: "/cadastro",
    };

    return {
      id: `fixture-post-${seed.slug}`,
      topicId: null,
      slug: seed.slug,
      status: "published",
      title: seed.title,
      excerpt: seed.excerpt,
      bodyHtml: "",
      bodyJson: draft as unknown as Record<string, unknown>,
      faqJson: seed.faq as unknown as Array<Record<string, unknown>>,
      keywordPrimary: seed.keywordPrimary,
      keywordsSecondary: seed.keywordsSecondary,
      cluster: seed.cluster,
      categorySlug: seed.categorySlug,
      tags: seed.tags,
      intent: seed.intent,
      funnelStage: seed.funnelStage,
      metaTitle: seed.metaTitle,
      metaDescription: seed.metaDescription,
      canonicalUrl: `${config.baseUrl}/blog/${seed.slug}`,
      jsonLd: {},
      authorSlug: author.slug,
      contextPackId: null,
      heroImageId: null,
      heroImageUrl: `${config.baseUrl}/blog-imagens/${seed.slug}/16x9.svg`,
      heroImageAlt: seed.title,
      imagePrompt: seed.imagePrompt,
      referencesJson: seed.references as unknown as Array<Record<string, unknown>>,
      semanticReview: {
        passed: true,
        qualityScore: 92,
        peopleFirstScore: 90,
        originalityScore: 86,
        duplicateSimilarity: 0.18,
        unsupportedClaims: 0,
        notes: ["Fixture local para preview editorial seguro."],
      },
      qualityScore: 92,
      duplicateSimilarity: "0.1800",
      internalProofCount: seed.internalProofs.length,
      requiredInternalLinks: 0,
      unsupportedClaims: 0,
      sourceProvenance: {
        localFixture: true,
        styleFocus: seed.styleFocus,
      },
      reviewNotes: "Fixture local segura para preview do blog",
      distributionPayload: {},
      readingTimeMinutes: 4,
      modelProvider: "mistral",
      modelName: "fixture-model",
      publishEligibleAt: publishedAt,
      refreshReason: "Fixture local",
      publishedAt,
      lastRefreshAt: publishedAt,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    } satisfies BlogPost;
  });

  return drafts.map((post) => {
    const draft = normalizeDraftFromStoredPost(post);
    const relatedPostStubs = drafts
      .filter((candidate) => candidate.slug !== post.slug)
      .map((candidate) => ({
        slug: candidate.slug,
        title: candidate.title,
        cluster: candidate.cluster,
        categorySlug: candidate.categorySlug,
      }));
    const internalLinks = buildInternalLinks(config.baseUrl, draft, relatedPostStubs);
    const bodyHtml = renderBodyHtml(draft, internalLinks);
    const completedPost: BlogPost = {
      ...post,
      bodyHtml,
      readingTimeMinutes: readingTimeFromText(bodyHtml),
      requiredInternalLinks: internalLinks.length,
      sourceProvenance: {
        ...(typeof post.sourceProvenance === "object" && post.sourceProvenance ? post.sourceProvenance as Record<string, unknown> : {}),
        internalLinks: internalLinks.map((item) => item.href),
        localFixture: true,
      },
    };
    return {
      ...completedPost,
      jsonLd: buildArticleJsonLd(
        completedPost,
        config,
        draft.faq,
        authors.find((author) => author.slug === completedPost.authorSlug) || authors[0],
      ),
    };
  });
}

async function getPublishedPublicPosts(config: BlogConfig, limit = 24): Promise<BlogPost[]> {
  if (isLocalBlogFixtureMode()) {
    await ensureBlogInfrastructure();
    const published = await getPublishedPostsFromDb(limit);
    if (published.length > 0) return published;
    return createFixturePublishedPosts(config).slice(0, limit);
  }
  await ensureBlogInfrastructure();
  return getPublishedPostsFromDb(limit);
}

async function getPublicAuthorProfile(config: BlogConfig, slug: string): Promise<BlogAuthorProfile | null> {
  const normalizedSlug = normalizePublicAuthorSlug(slug);
  if (isLocalBlogFixtureMode()) {
    return buildFixtureAuthorProfiles(config).find((author) => author.slug === normalizedSlug) || null;
  }
  await ensureAuthorProfiles(config);
  const author = await db.select().from(blogAuthorProfiles).where(eq(blogAuthorProfiles.slug, normalizedSlug)).limit(1).then((rows) => rows[0] || null);
  if (author) {
    return {
      ...author,
      name: repairMojibake(author.name),
      role: repairMojibake(author.role),
      bio: repairMojibake(author.bio),
    };
  }
  const fallbackSlug = slugify(config.authorName);
  if (normalizedSlug !== fallbackSlug) return null;
  return ensureDefaultAuthorProfile(config);
}

async function evaluateQualityGate(
  draft: BlogDraft,
  bodyHtml: string,
  internalLinks: InternalLink[],
  existingPosts: Array<Pick<BlogPost, "title" | "excerpt" | "bodyHtml">>,
  config: BlogConfig,
  contextPack: BlogContextPack | null,
): Promise<QualityGateResult> {
  const combinedText = `${draft.title}\n${draft.excerpt}\n${bodyHtml}`;
  const wordCount = countWordsFromText(bodyHtml);
  const duplicateSimilarity = existingPosts.reduce((max, post) => {
    return Math.max(max, similarityScore(combinedText, `${post.title}\n${post.excerpt}\n${post.bodyHtml}`));
  }, 0);

  const review = await callBlogJsonTask({
    taskName: "semantic-review",
    model: config.textModel,
    schema: semanticReviewSchema,
    prompt: "VocÃª Ã© um revisor editorial people-first alinhado ao Google Search. Reprove conteÃºdo escalado, genÃ©rico, facilmente reaproveitÃ¡vel para qualquer SaaS, com promessas vazias ou pouco valor novo. TambÃ©m reprove texto com cara de IA: excesso de frases paralelas, conectores repetidos, ritmo mecÃ¢nico, parÃ¡grafos que dizem o Ã³bvio sem decisÃ£o operacional, ou listas que caberiam em qualquer blog de software. SÃ³ aprove se o artigo tiver Ã¢ngulo especÃ­fico, utilidade prÃ¡tica, prova interna clara, diferenciaÃ§Ã£o real e linguagem natural de operador para operador.",
    userMessage: JSON.stringify({
      title: draft.title,
      excerpt: draft.excerpt,
      bodyHtml,
      internalProofs: draft.internalProofs,
      faq: draft.faq,
      internalLinks,
      duplicateSimilarity,
      contextPackSummary: contextPack?.summary || "",
      reviewChecklist: [
        "O artigo resolve uma busca real com profundidade suficiente?",
        `O artigo tem profundidade editorial ou ainda parece curto demais? Meta minima: ${BLOG_MIN_WORD_COUNT} palavras.`,
        "O texto traz criterio de decisao, implementacao ou medicao, em vez de beneficios vagos?",
        "As secoes sao especificas ou poderiam servir para qualquer ferramenta trocando a keyword?",
        "As provas internas realmente sustentam o que o texto promete?",
        "Existe risco de scaled content abuse ou de texto feito so para ranquear?",
      ],
    }),
    maxTokens: 1200,
  }).catch(() => {
    return {
      passed: false,
      qualityScore: 64,
      peopleFirstScore: 62,
      originalityScore: 60,
      unsupportedClaims: 1,
      publishDelayHours: 0,
      notes: ["Revisao semantica indisponivel; o autoblog deve reescrever e tentar novamente."],
      factualIssues: ["A revisao assistida por IA nao conseguiu validar o texto final."],
      seoIssues: internalLinks.length >= 5 ? [] : ["Adicione mais links internos antes de publicar."],
      styleIssues: ["Nao ha confianca suficiente para publicacao automatica nesta tentativa."],
      suggestedFixes: ["Gerar uma nova tentativa com foco em utilidade pratica, prova e diferenciacao real."],
    };
  });

  const structuralBoost =
    (draft.internalProofs.length >= 3 ? 2 : 0) +
    (internalLinks.length >= 5 ? 2 : 0) +
    (duplicateSimilarity <= 0.25 ? 2 : duplicateSimilarity <= 0.45 ? 1 : 0) +
    ((review.factualIssues?.length || 0) === 0 ? 1 : 0) +
    ((review.seoIssues?.length || 0) === 0 ? 1 : 0) +
    ((review.styleIssues?.length || 0) <= 1 ? 1 : 0);
  const blendedQualityScore = Math.min(
    96,
    Math.max(
      review.qualityScore,
      Math.round(((review.qualityScore + review.peopleFirstScore + review.originalityScore) / 3) + structuralBoost),
    ),
  );

  return {
    qualityScore: blendedQualityScore,
    duplicateSimilarity,
    internalProofCount: draft.internalProofs.length,
    requiredInternalLinks: internalLinks.length,
    unsupportedClaims: review.unsupportedClaims,
    peopleFirstScore: review.peopleFirstScore,
    originalityScore: review.originalityScore,
    publishDelayHours: review.publishDelayHours,
    wordCount,
    passed: review.passed && draft.internalProofs.length >= 3 && internalLinks.length >= 5 && duplicateSimilarity <= 0.68 && wordCount >= BLOG_MIN_WORD_COUNT,
    notes: wordCount >= BLOG_MIN_WORD_COUNT
      ? review.notes
      : [...review.notes, `O artigo ainda ficou curto para o padrao editorial minimo de ${BLOG_MIN_WORD_COUNT} palavras.`],
    factualIssues: review.factualIssues,
    seoIssues: review.seoIssues,
    styleIssues: review.styleIssues,
    suggestedFixes: wordCount >= BLOG_MIN_WORD_COUNT
      ? review.suggestedFixes
      : [...review.suggestedFixes, "Aumente a profundidade com mais contexto operacional, objecoes reais e criterios de decisao."],
  };
}

function buildVisualPrompt(post: BlogPost): string {
  const body = typeof post.bodyJson === "object" && post.bodyJson
    ? (post.bodyJson as Record<string, unknown>)
    : {};
  const imagePrompt = typeof body.imagePrompt === "string" ? body.imagePrompt : post.imagePrompt;
  const qualityGuardrails = [
    "wide 16:9 hero composition",
    "photorealistic editorial photography for a SaaS blog post",
    "human-centered professional business scene",
    "natural skin tones and candid gestures",
    "documentary style, premium startup brand look",
    "subtle teal and deep green accents",
    "clean lighting and strong focal point",
    "no text, no letters, no watermark, no logo overlay, no UI screenshot collage, no vector illustration, no 3d render",
  ].join(", ");
  if (imagePrompt) return `${imagePrompt}, ${qualityGuardrails}.`;
  return `Editorial image about ${post.keywordPrimary}, WhatsApp-driven sales and support workflow, smartphone present only as context, human-centered scene, ${qualityGuardrails}.`;
}

function detectImageMimeType(binary: Buffer): string {
  if (binary.length >= 4) {
    if (binary[0] === 0xff && binary[1] === 0xd8 && binary[2] === 0xff) return "image/jpeg";
    if (binary[0] === 0x89 && binary[1] === 0x50 && binary[2] === 0x4e && binary[3] === 0x47) return "image/png";
    if (binary.subarray(0, 4).toString("ascii") === "RIFF" && binary.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
    if (binary.subarray(0, 4).toString("utf8") === "<svg") return "image/svg+xml";
  }
  return "image/jpeg";
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("svg")) return "svg";
  return "jpg";
}

function buildNvidiaSeed(value: string): number {
  const digest = crypto.createHash("sha256").update(value).digest();
  return digest.readUInt32BE(0) % 2147483647;
}

function buildTemplatedSvg(post: BlogPost, config: BlogConfig): string {
  const category = post.categorySlug.replace(/-/g, " ");
  const title = post.title.length > 88 ? `${post.title.slice(0, 85)}...` : post.title;
  const brand = config.brandName;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">${escapeHtml(post.title)}</title>
  <desc id="desc">${escapeHtml(post.excerpt)}</desc>
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#115e59"/>
      <stop offset="100%" stop-color="#022c22"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1020" cy="100" r="140" fill="rgba(255,255,255,0.08)"/>
  <circle cx="110" cy="520" r="180" fill="rgba(20,184,166,0.16)"/>
  <rect x="84" y="88" width="1032" height="454" rx="32" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.14)"/>
  <text x="120" y="150" fill="#99f6e4" font-family="Arial, sans-serif" font-size="28" font-weight="700">${escapeHtml(category.toUpperCase())}</text>
  <text x="120" y="230" fill="#ffffff" font-family="Arial, sans-serif" font-size="54" font-weight="700">
    <tspan x="120" dy="0">${escapeHtml(title.slice(0, 34))}</tspan>
    <tspan x="120" dy="68">${escapeHtml(title.slice(34, 68))}</tspan>
    <tspan x="120" dy="68">${escapeHtml(title.slice(68, 102))}</tspan>
  </text>
  <text x="120" y="482" fill="#d1fae5" font-family="Arial, sans-serif" font-size="28">${escapeHtml(brand)} | Blog</text>
  <text x="120" y="524" fill="#ccfbf1" font-family="Arial, sans-serif" font-size="24">${escapeHtml(post.keywordPrimary)}</text>
</svg>`;
}

function buildVariantSvg(post: BlogPost, config: BlogConfig, width: number, height: number, label: string): string {
  const title = post.title.length > 72 ? `${post.title.slice(0, 69)}...` : post.title;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeHtml(post.title)}</title>
  <desc id="desc">${escapeHtml(post.excerpt)}</desc>
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#052e2b"/>
      <stop offset="100%" stop-color="#164e63"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.18)}" fill="#99f6e4" font-family="Arial, sans-serif" font-size="${Math.max(18, Math.round(width * 0.03))}" font-weight="700">${escapeHtml(label)}</text>
  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.42)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${Math.max(26, Math.round(width * 0.045))}" font-weight="700">${escapeHtml(title)}</text>
  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.78)}" fill="#d1fae5" font-family="Arial, sans-serif" font-size="${Math.max(16, Math.round(width * 0.025))}">${escapeHtml(config.brandName)} | ${escapeHtml(post.keywordPrimary)}</text>
</svg>`;
}

export async function buildBlogFixtureImageSvg(slug: string, variant: "16x9" | "4x3" | "1x1" = "16x9"): Promise<string | null> {
  if (!isLocalBlogFixtureMode()) return null;

  const config = await resolveBlogConfig();
  const fixturePost = createFixturePublishedPosts(config).find((item) => item.slug === slug);
  const post = fixturePost || await db.select().from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), inArray(blogPosts.status, ["published", "ready"])))
    .orderBy(desc(blogPosts.updatedAt))
    .limit(1)
    .then((rows) => rows[0] || null);
  if (!post) return null;

  if (variant === "16x9") return buildVariantSvg(post, config, 1200, 675, "BLOG 16X9");
  if (variant === "4x3") return buildVariantSvg(post, config, 1200, 900, "BLOG 4X3");
  return buildVariantSvg(post, config, 1200, 1200, "BLOG 1X1");
}

async function ensureSeoImageVariants(post: BlogPost, config: BlogConfig): Promise<string[]> {
  await ensureBlogAssetDir();
  const variants = [
    { key: "16x9", width: 1200, height: 675 },
    { key: "4x3", width: 1200, height: 900 },
    { key: "1x1", width: 1200, height: 1200 },
  ];

  const urls: string[] = [];
  for (const variant of variants) {
    const fileName = `${post.slug}-${variant.key}.svg`;
    const filePath = path.join(BLOG_ASSET_DIR, fileName);
    const svg = buildVariantSvg(post, config, variant.width, variant.height, `BLOG ${variant.key.toUpperCase()}`);
    await fs.writeFile(filePath, svg, "utf8");
    try {
      const uploaded = await uploadBlogAssetToStorage(fileName, Buffer.from(svg, "utf8"), "image/svg+xml");
      urls.push(uploaded.publicUrl);
    } catch (error) {
      console.error(`[BLOG] Falha ao publicar variante SEO ${variant.key}:`, error);
      urls.push(`/uploads/blog-assets/${fileName}`);
    }
  }

  return urls;
}

async function saveImageAsset(post: BlogPost, payload: {
  provider: string;
  model: string | null;
  prompt: string;
  mimeType: string;
  fileName: string;
  content: Buffer;
  altText: string;
  sourceProvenance: Record<string, unknown>;
}): Promise<BlogAssetImage> {
  await ensureBlogAssetDir();
  const localFilePath = path.join(BLOG_ASSET_DIR, payload.fileName);
  const localPublicUrl = `/uploads/blog-assets/${payload.fileName}`;
  await fs.writeFile(localFilePath, payload.content);

  let filePath = localFilePath;
  let publicUrl = localPublicUrl;
  let sourceProvenance: Record<string, unknown> = { ...payload.sourceProvenance };
  const metadata: Record<string, unknown> = {
    localCachePath: localFilePath,
    localCacheUrl: localPublicUrl,
    contentLength: payload.content.length,
  };

  try {
    const uploaded = await uploadBlogAssetToStorage(payload.fileName, payload.content, payload.mimeType);
    filePath = uploaded.objectPath;
    publicUrl = uploaded.publicUrl;
    sourceProvenance = {
      ...sourceProvenance,
      storage: {
        provider: "supabase",
        bucket: uploaded.bucket,
        path: uploaded.objectPath,
        localCachePath: localFilePath,
        localCacheUrl: localPublicUrl,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no upload do asset";
    console.error("[BLOG] Falha ao enviar asset do blog para storage publico:", error);
    sourceProvenance = {
      ...sourceProvenance,
      storage: {
        provider: "local-cache",
        bucket: null,
        path: localFilePath,
        localCacheUrl: localPublicUrl,
        uploadError: message,
      },
    };
  }

  const [asset] = await db.insert(blogAssetImages).values({
    provider: payload.provider,
    model: payload.model,
    prompt: payload.prompt,
    altText: payload.altText,
    mimeType: payload.mimeType,
    filePath,
    publicUrl,
    sourceProvenance,
    metadata,
  }).returning();

  return asset;
}

async function downloadMistralFile(fileId: string): Promise<Buffer> {
  const mistral = await getMistralClient();
  const stream = await mistral.files.download({ fileId });
  const arrayBuffer = await new Response(stream as unknown as BodyInit).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function extractToolFileFromConversation(output: unknown): { fileId: string; fileName?: string | null; fileType?: string | null } | null {
  if (!Array.isArray(output)) return null;

  for (const entry of output as Array<Record<string, unknown>>) {
    const content = entry?.content;
    if (!Array.isArray(content)) continue;

    for (const chunk of content as Array<Record<string, unknown>>) {
      if (chunk?.type === "tool_file" && chunk?.tool === "image_generation" && typeof chunk.fileId === "string") {
        return {
          fileId: chunk.fileId,
          fileName: typeof chunk.fileName === "string" ? chunk.fileName : null,
          fileType: typeof chunk.fileType === "string" ? chunk.fileType : null,
        };
      }
      if (chunk?.type === "tool_file" && chunk?.tool === "image_generation" && typeof chunk.file_id === "string") {
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

function getNvidiaImageModels(config: BlogConfig): string[] {
  const models = [config.nvidiaImageModel, config.nvidiaImageFallbackModel]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(models));
}

async function requestNvidiaImage(model: string, prompt: string, apiKey: string, seed: number): Promise<Buffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NVIDIA_IMAGE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`https://ai.api.nvidia.com/v1/genai/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        prompt,
        seed,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`NVIDIA ${model} excedeu ${NVIDIA_IMAGE_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`NVIDIA ${model} retornou ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`);
  }

  const payload = await response.json().catch(() => null) as { artifacts?: Array<{ base64?: string | null }> } | null;
  const base64 = payload?.artifacts?.[0]?.base64;
  if (!base64) {
    throw new Error(`NVIDIA ${model} nao retornou artifacts base64`);
  }

  return Buffer.from(base64, "base64");
}

async function generateImageWithNvidia(post: BlogPost, config: BlogConfig): Promise<BlogAssetImage | null> {
  if (!config.nvidiaApiKey) return null;

  const prompt = buildVisualPrompt(post);
  const seed = buildNvidiaSeed(`${post.slug}:${post.keywordPrimary}:${post.title}`);
  const models = getNvidiaImageModels(config);

  for (const model of models) {
    try {
      const binary = await requestNvidiaImage(model, prompt, config.nvidiaApiKey, seed);
      if (!binary) continue;
      const mimeType = detectImageMimeType(binary);
      const extension = extensionFromMimeType(mimeType);
      return await saveImageAsset(post, {
        provider: "nvidia",
        model,
        prompt,
        mimeType,
        fileName: `${post.slug}-${crypto.randomUUID()}.${extension}`,
        content: binary,
        altText: post.heroImageAlt || `Imagem editorial do artigo ${post.title}`,
        sourceProvenance: { model, via: "nvidia-genai", seed },
      });
    } catch (error) {
      console.error(`[BLOG] Falha ao gerar imagem com NVIDIA (${model}):`, error);
    }
  }

  return null;
}

async function generateImageWithMistral(post: BlogPost, config: BlogConfig): Promise<BlogAssetImage | null> {
  try {
    await resolveApiKey();
    const mistral = await getMistralClient();
    const visualPrompt = buildVisualPrompt(post);
    const response = await mistral.beta.conversations.start({
      model: config.textModel,
      tools: [{ type: "image_generation" }],
      inputs: [
        {
          role: "user",
          content: `Create one editorial hero image for a blog article. ${visualPrompt}`,
        },
      ],
      store: false,
    });

    const toolFile = extractToolFileFromConversation(response.outputs as unknown);
    if (!toolFile?.fileId) {
      return null;
    }

    const binary = await downloadMistralFile(toolFile.fileId);
    const extension = toolFile.fileType?.includes("jpeg")
      ? "jpg"
      : toolFile.fileType?.includes("webp")
        ? "webp"
        : "png";

    return await saveImageAsset(post, {
      provider: "mistral",
      model: config.textModel,
      prompt: visualPrompt,
      mimeType: toolFile.fileType || "image/png",
      fileName: `${post.slug}-${crypto.randomUUID()}.${extension}`,
      content: binary,
      altText: post.heroImageAlt || `Imagem editorial do artigo ${post.title}`,
      sourceProvenance: { fileId: toolFile.fileId, via: "mistral.beta.conversations.start" },
    });
  } catch (error) {
    console.error("[BLOG] Falha ao gerar imagem com Mistral:", error);
    return null;
  }
}

async function generateImageWithHuggingFace(post: BlogPost, config: BlogConfig): Promise<BlogAssetImage | null> {
  if (!config.hfApiToken || !config.hfImageModel) {
    return null;
  }

  try {
    const prompt = buildVisualPrompt(post);
    const response = await fetch(`https://api-inference.huggingface.co/models/${config.hfImageModel}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.hfApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt }),
    });

    if (!response.ok) {
      return null;
    }

    const mimeType = response.headers.get("content-type") || "image/png";
    const binary = Buffer.from(await response.arrayBuffer());
    const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";

    return await saveImageAsset(post, {
      provider: "huggingface",
      model: config.hfImageModel,
      prompt,
      mimeType,
      fileName: `${post.slug}-${crypto.randomUUID()}.${extension}`,
      content: binary,
      altText: post.heroImageAlt || `Imagem editorial do artigo ${post.title}`,
      sourceProvenance: { model: config.hfImageModel, via: "huggingface-inference" },
    });
  } catch (error) {
    console.error("[BLOG] Falha ao gerar imagem com Hugging Face:", error);
    return null;
  }
}

async function generateTemplatedImage(post: BlogPost, config: BlogConfig): Promise<BlogAssetImage> {
  const svg = buildTemplatedSvg(post, config);
  return saveImageAsset(post, {
    provider: "template",
    model: null,
    prompt: buildVisualPrompt(post),
    mimeType: "image/svg+xml",
    fileName: `${post.slug}-${crypto.randomUUID()}.svg`,
    content: Buffer.from(svg, "utf8"),
    altText: post.heroImageAlt || `Capa editorial do artigo ${post.title}`,
    sourceProvenance: { via: "local-template" },
  });
}

async function ensureHeroImage(
  post: BlogPost,
  config: BlogConfig,
  options?: { requirePublishableAiImage?: boolean },
): Promise<BlogAssetImage> {
  const existingImage = post.heroImageId
    ? await db.select().from(blogAssetImages).where(eq(blogAssetImages.id, post.heroImageId)).limit(1).then((rows) => rows[0])
    : null;

  if (existingImage && !options?.requirePublishableAiImage) {
    return existingImage;
  }

  if (existingImage && options?.requirePublishableAiImage && !getAssetPublishabilityIssue(existingImage)) {
    return existingImage;
  }

  const nvidiaAsset = await generateImageWithNvidia(post, config);
  if (nvidiaAsset && (!options?.requirePublishableAiImage || !getAssetPublishabilityIssue(nvidiaAsset))) return nvidiaAsset;

  const mistralAsset = await generateImageWithMistral(post, config);
  if (mistralAsset && (!options?.requirePublishableAiImage || !getAssetPublishabilityIssue(mistralAsset))) return mistralAsset;

  const hfAsset = await generateImageWithHuggingFace(post, config);
  if (hfAsset && (!options?.requirePublishableAiImage || !getAssetPublishabilityIssue(hfAsset))) return hfAsset;

  if (options?.requirePublishableAiImage) {
    const reason = getAssetPublishabilityIssue(hfAsset)
      || getAssetPublishabilityIssue(mistralAsset)
      || getAssetPublishabilityIssue(nvidiaAsset)
      || getAssetPublishabilityIssue(existingImage)
      || "Nenhum provedor conseguiu gerar uma imagem de IA publica para o post.";
    throw new Error(`Publicacao bloqueada: ${reason}`);
  }

  return generateTemplatedImage(post, config);
}

export async function generateBlogImagePreviewAsset(postId: string): Promise<BlogAssetImage> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  const post = await getPostById(postId);
  if (!post) {
    throw new Error("Post nao encontrado");
  }

  const nvidiaAsset = await generateImageWithNvidia(post, config);
  if (nvidiaAsset) return nvidiaAsset;

  const mistralAsset = await generateImageWithMistral(post, config);
  if (mistralAsset) return mistralAsset;

  const hfAsset = await generateImageWithHuggingFace(post, config);
  if (hfAsset) return hfAsset;

  return generateTemplatedImage(post, config);
}

function mapPostSummary(post: BlogPost): PublicPostSummary {
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

async function getPublishingCadenceStatus(post: Pick<BlogPost, "cluster" | "publishedAt">): Promise<PublishingCadenceStatus> {
  const config = await resolveBlogConfig();
  const now = new Date();
  const minWindowAgo = new Date(now.getTime() - config.publishMinHoursBetween * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const recentPublished = await db.select({
    id: blogPosts.id,
    cluster: blogPosts.cluster,
    publishedAt: blogPosts.publishedAt,
  }).from(blogPosts).where(and(eq(blogPosts.status, "published"), isNotNull(blogPosts.publishedAt))).orderBy(desc(blogPosts.publishedAt)).limit(20);

  const lastPublishedAt = recentPublished[0]?.publishedAt ? toDate(recentPublished[0].publishedAt) : null;
  const publishedToday = recentPublished.filter((item) => {
    const publishedAt = toDate(item.publishedAt);
    return publishedAt && publishedAt >= startOfDay;
  }).length;
  const clusterPublishedThisWeek = recentPublished.filter((item) => {
    const publishedAt = toDate(item.publishedAt);
    return item.cluster === post.cluster && publishedAt && publishedAt >= sevenDaysAgo;
  }).length;

  if (publishedToday >= config.publishMaxPerDay) {
    return {
      canPublish: false,
      waitHours: 24,
      reason: `Limite diario de ${config.publishMaxPerDay} posts atingido`,
      lastPublishedAt,
      publishedToday,
      clusterPublishedThisWeek,
      maxPostsPerDay: config.publishMaxPerDay,
      minHoursBetweenPosts: config.publishMinHoursBetween,
      maxClusterPostsPerWeek: config.publishMaxClusterPerWeek,
    };
  }

  if (lastPublishedAt && lastPublishedAt > minWindowAgo) {
    return {
      canPublish: false,
      waitHours: Math.max(1, Math.ceil((lastPublishedAt.getTime() + config.publishMinHoursBetween * 60 * 60 * 1000 - now.getTime()) / (60 * 60 * 1000))),
      reason: `Janela minima de ${config.publishMinHoursBetween} hora(s) ainda nao foi cumprida`,
      lastPublishedAt,
      publishedToday,
      clusterPublishedThisWeek,
      maxPostsPerDay: config.publishMaxPerDay,
      minHoursBetweenPosts: config.publishMinHoursBetween,
      maxClusterPostsPerWeek: config.publishMaxClusterPerWeek,
    };
  }

  if (clusterPublishedThisWeek >= config.publishMaxClusterPerWeek) {
    return {
      canPublish: false,
      waitHours: 24,
      reason: `Cluster ja atingiu o limite semanal de ${config.publishMaxClusterPerWeek} posts`,
      lastPublishedAt,
      publishedToday,
      clusterPublishedThisWeek,
      maxPostsPerDay: config.publishMaxPerDay,
      minHoursBetweenPosts: config.publishMinHoursBetween,
      maxClusterPostsPerWeek: config.publishMaxClusterPerWeek,
    };
  }

  return {
    canPublish: true,
    waitHours: 0,
    reason: null,
    lastPublishedAt,
    publishedToday,
    clusterPublishedThisWeek,
    maxPostsPerDay: config.publishMaxPerDay,
    minHoursBetweenPosts: config.publishMinHoursBetween,
    maxClusterPostsPerWeek: config.publishMaxClusterPerWeek,
  };
}

function normalizeFaq(faqJson: unknown): BlogFaqItem[] {
  if (!Array.isArray(faqJson)) return [];
  return faqJson
    .map((item) => ({
      question: String((item as Record<string, unknown>).question || "").trim(),
      answer: String((item as Record<string, unknown>).answer || "").trim(),
    }))
    .filter((item) => item.question && item.answer);
}

function normalizeOutline(outlineJson: unknown): Array<{ heading: string; angle: string }> {
  if (!Array.isArray(outlineJson)) return [];
  return outlineJson
    .map((item) => ({
      heading: String((item as Record<string, unknown>).heading || "").trim(),
      angle: String((item as Record<string, unknown>).angle || "").trim(),
    }))
    .filter((item) => item.heading);
}

function normalizeStringList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function normalizeInternalLinksFromPost(post: BlogPost): InternalLink[] {
  const provenance = typeof post.sourceProvenance === "object" && post.sourceProvenance
    ? post.sourceProvenance as Record<string, unknown>
    : {};
  const urls = normalizeStringList(provenance.internalLinks, 8);
  return urls.map((href) => ({
    href,
    label: href,
    kind: href.startsWith("/ajuda") ? "help" : href.startsWith("/cadastro") ? "cta" : "blog",
  }));
}

function normalizeDraftFromStoredPost(post: BlogPost): BlogDraft {
  const body = typeof post.bodyJson === "object" && post.bodyJson
    ? post.bodyJson as Record<string, unknown>
    : {};

  const sections = Array.isArray(body.sections)
    ? (body.sections as Array<Record<string, unknown>>).map((section) => ({
        heading: String(section.heading || "").trim(),
        paragraphs: normalizeStringList(section.paragraphs, 8),
        bullets: normalizeStringList(section.bullets, 8),
        proof: normalizeStringList(section.proof, 6),
      })).filter((section) => section.heading && section.paragraphs.length > 0)
    : [];

  return {
    title: String(body.title || post.title || "").trim(),
    excerpt: String(body.excerpt || post.excerpt || "").trim(),
    metaTitle: String(body.metaTitle || post.metaTitle || "").trim(),
    metaDescription: String(body.metaDescription || post.metaDescription || "").trim(),
    categorySlug: slugify(String(body.categorySlug || post.categorySlug || "").trim()),
    tags: normalizeStringList(body.tags, 8).map((item) => slugify(item)).filter(Boolean),
    cluster: slugify(String(body.cluster || post.cluster || "").trim()),
    intent: String(body.intent || post.intent || "commercial") as BlogIntent,
    funnelStage: String(body.funnelStage || post.funnelStage || "mofu") as FunnelStage,
    keywordPrimary: normalizeWhitespace(String(body.keywordPrimary || post.keywordPrimary || "").trim()),
    keywordsSecondary: normalizeStringList(body.keywordsSecondary, 6),
    imagePrompt: String(body.imagePrompt || post.imagePrompt || "").trim(),
    internalProofs: normalizeStringList(body.internalProofs, 6),
    sections,
    faq: normalizeFaq(body.faq || post.faqJson),
    ctaLabel: String(body.ctaLabel || "Criar conta gratis").trim(),
    ctaUrl: String(body.ctaUrl || "/cadastro").trim(),
  };
}

function buildPostApprovalPayload(input: {
  gate: QualityGateResult;
  config: BlogConfig;
  refreshReason?: string | null;
  currentReview?: Record<string, unknown> | null;
}) {
  const currentReview = input.currentReview || {};
  const approval = buildBlogApprovalSummary({
    passed: input.gate.passed,
    qualityScore: input.gate.qualityScore,
    duplicateSimilarity: input.gate.duplicateSimilarity,
    internalProofCount: input.gate.internalProofCount,
    requiredInternalLinks: input.gate.requiredInternalLinks,
    unsupportedClaims: input.gate.unsupportedClaims,
    peopleFirstScore: input.gate.peopleFirstScore,
    originalityScore: input.gate.originalityScore,
    notes: input.gate.notes,
    factualIssues: input.gate.factualIssues,
    seoIssues: input.gate.seoIssues,
    styleIssues: input.gate.styleIssues,
    suggestedFixes: input.gate.suggestedFixes,
    autoApproveEnabled: input.config.autoApproveEnabled,
    autoPublishEnabled: input.config.autoPublishEnabled,
    publishEnabled: input.config.publishEnabled,
  });

  const semanticReview = {
    ...currentReview,
    passed: input.gate.passed,
    qualityScore: input.gate.qualityScore,
    duplicateSimilarity: input.gate.duplicateSimilarity,
    unsupportedClaims: input.gate.unsupportedClaims,
    peopleFirstScore: input.gate.peopleFirstScore,
    originalityScore: input.gate.originalityScore,
    publishDelayHours: input.gate.publishDelayHours,
    notes: input.gate.notes,
    factualIssues: input.gate.factualIssues,
    seoIssues: input.gate.seoIssues,
    styleIssues: input.gate.styleIssues,
    suggestedFixes: input.gate.suggestedFixes,
    blockingReasons: approval.blockingReasons,
    improvementActions: approval.improvementActions,
    meetsQualityBar: approval.meetsQualityBar,
    meetsAutoPublishBar: approval.meetsAutoPublishBar,
    approvalDecision: approval.decision,
    autoApproved: approval.autoApproved,
    canAutoPublish: approval.canAutoPublish,
    reviewState: approval.decision === "blocked" ? "needs-fix" : approval.decision === "needs-review" ? "needs-human-review" : "approved",
    refreshReason: input.refreshReason || input.gate.notes[0] || "",
    reviewer: "mistral",
    reviewedAt: new Date().toISOString(),
  } satisfies Record<string, unknown>;

  return { approval, semanticReview };
}

function getArchivedStatusFallback(post: BlogPost): PostStatus {
  const provenance = typeof post.sourceProvenance === "object" && post.sourceProvenance
    ? post.sourceProvenance as Record<string, unknown>
    : {};
  const lifecycle = typeof provenance.lifecycle === "object" && provenance.lifecycle
    ? provenance.lifecycle as Record<string, unknown>
    : {};
  const previousStatus = String(lifecycle.previousStatus || "").trim();
  if (previousStatus === "published" || previousStatus === "ready" || previousStatus === "rejected" || previousStatus === "draft") {
    return previousStatus as PostStatus;
  }
  return "ready";
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function collectPostImageUrls(post: BlogPost, config: BlogConfig): string[] {
  const urls = new Set<string>();
  const provenance = typeof post.sourceProvenance === "object" && post.sourceProvenance
    ? post.sourceProvenance as Record<string, unknown>
    : {};

  const addUrl = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;
    urls.add(new URL(value, config.baseUrl).toString());
  };

  addUrl(post.heroImageUrl);
  if (Array.isArray(provenance.imageVariants)) {
    for (const item of provenance.imageVariants) addUrl(item);
  }

  if (isLocalBlogFixtureMode()) {
    addUrl(`/blog-imagens/${post.slug}/16x9.svg`);
    addUrl(`/blog-imagens/${post.slug}/4x3.svg`);
    addUrl(`/blog-imagens/${post.slug}/1x1.svg`);
  }

  if (urls.size === 0) {
    addUrl("/uploads/blog-assets/default-blog.svg");
  }

  return Array.from(urls);
}

function resolveLocalPreviewAssetUrl(value: string, config: BlogConfig): string {
  if (!isLocalBlogFixtureMode()) return value;
  try {
    const parsed = new URL(value, config.baseUrl);
    if (parsed.pathname.startsWith("/blog-imagens/") || parsed.pathname.startsWith("/uploads/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return value;
  }
  return value;
}

function resolvePostImageUrl(post: Pick<BlogPost, "slug" | "heroImageUrl">, config: BlogConfig, variant: "16x9" | "4x3" | "1x1" = "16x9"): string {
  if (isLocalBlogFixtureMode()) return `/blog-imagens/${post.slug}/${variant}.svg`;
  if (post.heroImageUrl) return resolveLocalPreviewAssetUrl(post.heroImageUrl, config);
  return "/uploads/blog-assets/default-blog.svg";
}

function renderVisibleBreadcrumbs(items: Array<{ href?: string; label: string }>): string {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.map((item, index) => {
    const content = item.href
      ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
      : `<span aria-current="page">${escapeHtml(item.label)}</span>`;
    return `${index > 0 ? '<span class="breadcrumb-sep">/</span>' : ""}${content}`;
  }).join("")}</nav>`;
}

function buildOrganizationJsonLd(config: BlogConfig): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.brandName,
    url: config.baseUrl,
  };
}

function renderBlogHeader(config: BlogConfig): string {
  const links = [
    { href: "/", label: "Produto" },
    { href: "/blog", label: "Blog" },
    { href: "/ajuda", label: "Ajuda" },
    { href: "/cadastro", label: "Comecar" },
    { href: "/login", label: "Entrar" },
  ];

  return `<header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-copy">
        <strong>${escapeHtml(config.brandName)}</strong>
        <span>IA para WhatsApp e automacao comercial</span>
      </span>
    </a>
    <nav class="nav" aria-label="Principal">
      ${links.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`).join("")}
      <a class="nav-cta" href="/cadastro">Criar conta</a>
    </nav>
  </header>`;
}

function renderBlogFooter(
  config: BlogConfig,
  categories: Array<{ slug: string; href: string }>,
  tags: Array<{ slug: string; href: string }>,
): string {
  return `<footer class="site-footer">
    <div class="footer-grid">
      <section class="footer-brand">
        <div class="footer-brand-row">
          <span class="brand-mark" aria-hidden="true"></span>
          <div>
            <strong>${escapeHtml(config.brandName)}</strong>
            <p>Guias práticos sobre vendas, atendimento, agenda e operação no WhatsApp.</p>
          </div>
        </div>
      </section>
      <section>
        <h2>Produto</h2>
        <ul class="footer-links">
          <li><a href="/">Pagina inicial</a></li>
          <li><a href="/cadastro">Criar conta</a></li>
          <li><a href="/login">Entrar</a></li>
          <li><a href="/blog">Blog</a></li>
        </ul>
      </section>
      <section>
        <h2>Conteudo</h2>
        <ul class="footer-links">
          <li><a href="/blog">Todos os artigos</a></li>
          ${categories.slice(0, 4).map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(humanizeSlug(item.slug))}</a></li>`).join("")}
        </ul>
      </section>
      <section>
        <h2>Explorar</h2>
        <ul class="footer-links">
          <li><a href="/ajuda">Central de ajuda</a></li>
          <li><a href="/termos-de-uso">Termos de uso</a></li>
          ${tags.slice(0, 4).map((item) => `<li><a href="${escapeHtml(item.href)}">#${escapeHtml(item.slug)}</a></li>`).join("")}
        </ul>
      </section>
    </div>
    <div class="footer-bottom">
      <p>Conteúdo ligado ao produto, à central de ajuda e aos principais gargalos operacionais do WhatsApp.</p>
      <p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.brandName)}</p>
    </div>
  </footer>`;
}

function renderPostCard(post: PublicPostSummary, config: BlogConfig, options?: { featured?: boolean }): string {
  const imageUrl = resolvePostImageUrl(post, config, "16x9");
  const imageAlt = post.heroImageAlt || post.title;
  const tagHtml = post.tags.slice(0, 3).map((tag) => `<li><a href="/blog/tag/${escapeHtml(tag)}">#${escapeHtml(tag)}</a></li>`).join("");
  const categoryLabel = humanizeSlug(post.categorySlug);

  return `<article class="post-card${options?.featured ? " featured" : ""}">
    <a class="post-card-media" href="/blog/${escapeHtml(post.slug)}">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}" loading="${options?.featured ? "eager" : "lazy"}" decoding="async" />
    </a>
    <div class="post-card-body">
      <div class="post-card-meta">
        <span class="eyebrow">${escapeHtml(categoryLabel)}</span>
        <span class="meta">${post.publishedAt ? toIsoDate(post.publishedAt) : toIsoDate()} | ${post.readingTimeMinutes} min</span>
      </div>
      <h2><a href="/blog/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></h2>
      <p>${escapeHtml(post.excerpt)}</p>
      <div class="post-card-footer">
        <ul class="pill-list">${tagHtml}</ul>
        <a class="text-link" href="/blog/${escapeHtml(post.slug)}">Ler artigo</a>
      </div>
    </div>
  </article>`;
}

function buildOutlineForPost(post: BlogPost, contextPack: BlogContextPack | null): Array<{ heading: string; angle: string }> {
  const outline = normalizeOutline(contextPack?.outline);
  if (outline.length > 0) return outline;
  const draft = normalizeDraftFromStoredPost(post);
  return draft.sections.map((section) => ({ heading: section.heading, angle: "" }));
}

function buildPublicStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    :root { color-scheme: light; --bg: #f3f6f4; --panel: rgba(255,255,255,0.94); --panel-strong: #ffffff; --ink: #122025; --muted: #58707c; --line: rgba(18, 32, 37, 0.12); --accent: #0f766e; --accent-ink: #ecfeff; --accent-soft: rgba(15, 118, 110, 0.10); --shadow: 0 24px 80px rgba(15, 23, 42, 0.10); --shadow-soft: 0 18px 45px rgba(15, 23, 42, 0.07); }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif; background:
      radial-gradient(circle at top left, rgba(45, 212, 191, 0.18), transparent 30%),
      radial-gradient(circle at top right, rgba(15, 118, 110, 0.12), transparent 28%),
      linear-gradient(180deg, #f7faf8 0%, var(--bg) 100%);
      color: var(--ink); line-height: 1.7; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: none; }
    img { display: block; max-width: 100%; }
    .page-bg { min-height: 100vh; position: relative; overflow-x: clip; }
    .page-bg::before, .page-bg::after { content: ""; position: fixed; inset: auto; z-index: -1; pointer-events: none; border-radius: 999px; filter: blur(12px); }
    .page-bg::before { top: 88px; right: -120px; width: 320px; height: 320px; background: rgba(45, 212, 191, 0.12); }
    .page-bg::after { bottom: 48px; left: -80px; width: 260px; height: 260px; background: rgba(14, 116, 144, 0.10); }
    .shell { max-width: 1240px; margin: 0 auto; padding: 24px 20px 80px; }
    .topbar { position: sticky; top: 0; z-index: 20; display: flex; gap: 18px; align-items: center; justify-content: space-between; margin-bottom: 28px; padding: 14px 18px; background: rgba(255,255,255,0.80); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.7); border-radius: 24px; box-shadow: var(--shadow-soft); }
    .brand { display: inline-flex; align-items: center; gap: 14px; color: var(--ink); min-width: 0; }
    .brand-copy { display: flex; flex-direction: column; min-width: 0; }
    .brand-copy strong { font-size: 16px; letter-spacing: 0.01em; }
    .brand-copy span { color: var(--muted); font-size: 12px; }
    .brand-mark { width: 42px; height: 42px; border-radius: 14px; background: linear-gradient(135deg, #14b8a6, #0f766e); box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), 0 16px 34px rgba(15,118,110,0.22); position: relative; flex: 0 0 auto; }
    .brand-mark::before, .brand-mark::after { content: ""; position: absolute; border-radius: 999px; background: rgba(255,255,255,0.92); }
    .brand-mark::before { width: 18px; height: 18px; top: 8px; left: 12px; }
    .brand-mark::after { width: 10px; height: 10px; bottom: 8px; right: 10px; }
    .nav { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    .nav a { padding: 10px 14px; border-radius: 999px; color: #28434c; font-size: 14px; transition: background 160ms ease, color 160ms ease, transform 160ms ease; }
    .nav a:hover { background: rgba(15, 118, 110, 0.08); color: var(--accent); transform: translateY(-1px); }
    .nav-cta { background: linear-gradient(135deg, #0f766e, #14b8a6); color: #ecfeff !important; font-weight: 700; box-shadow: 0 16px 28px rgba(15,118,110,0.18); }
    .breadcrumbs { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: var(--muted); font-size: 13px; margin: 0 0 18px; }
    .breadcrumbs a { color: var(--muted); }
    .breadcrumbs a:hover { color: var(--accent); }
    .breadcrumb-sep { color: rgba(88,112,124,0.55); }
    .hero, .card, .article-shell, .faq-card, .post-card, .stat-card, .sidebar-card { background: var(--panel); border: 1px solid var(--line); border-radius: 28px; box-shadow: var(--shadow-soft); backdrop-filter: blur(12px); }
    .hero { padding: 32px; margin-bottom: 28px; overflow: hidden; position: relative; }
    .hero::after { content: ""; position: absolute; inset: -24% auto auto 58%; width: 320px; height: 320px; background: radial-gradient(circle, rgba(45,212,191,0.16), transparent 65%); pointer-events: none; }
    .hero-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.9fr); gap: 22px; align-items: stretch; }
    .hero-copy { position: relative; z-index: 1; }
    .hero h1 { margin: 0 0 14px; font-size: clamp(36px, 5vw, 62px); line-height: 1.02; letter-spacing: -0.04em; max-width: 12ch; }
    .hero p { margin: 0; color: var(--muted); max-width: 760px; font-size: 17px; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; }
    .button, .button-secondary { display: inline-flex; align-items: center; justify-content: center; padding: 13px 18px; border-radius: 16px; font-weight: 700; transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease; }
    .button { background: linear-gradient(135deg, #0f766e, #14b8a6); color: #ecfeff; box-shadow: 0 18px 32px rgba(15,118,110,0.18); }
    .button-secondary { background: rgba(255,255,255,0.82); color: var(--ink); border: 1px solid rgba(18,32,37,0.08); }
    .button:hover, .button-secondary:hover { transform: translateY(-1px); }
    .hero-highlight, .stat-card { padding: 22px; }
    .hero-highlight { display: grid; gap: 14px; align-content: space-between; background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(240,253,250,0.92)); }
    .hero-highlight h2, .hero-highlight h3, .card h2, .card h3, .post-card h2, .post-card h3, .sidebar-card h3 { margin: 0; line-height: 1.15; letter-spacing: -0.02em; }
    .hero-highlight p, .post-card p, .sidebar-card p, .card p { margin: 0; color: var(--muted); }
    .hero-highlight ul, .card ul, .article-shell ul { margin: 0; padding-left: 20px; }
    .hero-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 18px 0 0; }
    .stat-card strong { display: block; font-size: 26px; line-height: 1; letter-spacing: -0.03em; margin-bottom: 8px; }
    .stat-card span { color: var(--muted); font-size: 14px; }
    .section-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin: 0 0 18px; }
    .section-head h2 { margin: 0; font-size: clamp(24px, 3vw, 34px); line-height: 1.05; letter-spacing: -0.03em; }
    .section-head p { margin: 0; max-width: 620px; color: var(--muted); }
    .grid { display: grid; gap: 20px; }
    .grid.posts { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .split-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.85fr); gap: 20px; margin-top: 28px; }
    .card { padding: 24px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 14px; font-weight: 700; }
    .meta { color: var(--muted); font-size: 14px; }
    .post-card { overflow: hidden; display: grid; min-height: 100%; }
    .post-card-media { display: block; aspect-ratio: 16 / 9; background: linear-gradient(135deg, rgba(20,184,166,0.12), rgba(15,118,110,0.20)); overflow: hidden; }
    .post-card-media img { width: 100%; height: 100%; object-fit: cover; transition: transform 240ms ease; }
    .post-card:hover .post-card-media img { transform: scale(1.03); }
    .post-card-body { padding: 22px; display: grid; gap: 14px; }
    .post-card-body h2 { font-size: 24px; }
    .post-card-meta, .post-card-footer { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    .post-card-footer { padding-top: 8px; border-top: 1px solid rgba(18,32,37,0.08); }
    .post-card.featured .post-card-body h2 { font-size: clamp(28px, 3vw, 36px); }
    .text-link { font-weight: 700; color: var(--accent); }
    .pill-list { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .pill-list a, .pill-list span { display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgba(15, 118, 110, 0.08); color: var(--accent); font-size: 13px; }
    .article-layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, 0.55fr); gap: 22px; align-items: start; }
    .article-main { min-width: 0; }
    .article-shell { padding: 34px; }
    .article-cover { margin: 22px 0 24px; border-radius: 24px; overflow: hidden; border: 1px solid var(--line); background: rgba(15,118,110,0.05); }
    .article-cover img { width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; }
    .article-cover figcaption { padding: 12px 16px; color: var(--muted); font-size: 13px; background: rgba(255,255,255,0.72); }
    .article-shell h1 { margin: 0 0 14px; line-height: 1.02; font-size: clamp(36px, 4vw, 58px); letter-spacing: -0.04em; max-width: 15ch; }
    .article-shell h2 { margin: 38px 0 14px; line-height: 1.1; letter-spacing: -0.03em; font-size: clamp(24px, 2.6vw, 34px); scroll-margin-top: 120px; }
    .article-shell p, .article-shell li { color: #1d3038; font-size: 17px; }
    .article-shell ul { padding-left: 22px; }
    .article-shell ol { padding-left: 22px; }
    .article-intro { display: grid; gap: 14px; }
    .article-kicker { max-width: 60ch; font-size: 18px; }
    .article-meta-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; color: var(--muted); font-size: 14px; }
    .blog-section + .blog-section { margin-top: 20px; }
    .blog-proof, .blog-cta { padding: 18px 20px; border-radius: 20px; background: linear-gradient(135deg, rgba(15,118,110,0.08), rgba(20,184,166,0.04)); border: 1px solid rgba(15,118,110,0.14); margin-top: 16px; }
    .blog-links ul { display: grid; gap: 10px; }
    .cta-button { display: inline-block; margin-top: 12px; padding: 12px 18px; border-radius: 14px; background: var(--accent); color: var(--accent-ink); font-weight: 700; }
    .sidebar-card { padding: 22px; position: sticky; top: 96px; display: grid; gap: 14px; }
    .sidebar-card + .sidebar-card { margin-top: 18px; }
    .sidebar-card ol { margin: 0; padding-left: 18px; display: grid; gap: 10px; }
    .site-footer { margin-top: 34px; padding: 28px; border-radius: 28px; background: #0f1720; color: rgba(236,254,255,0.92); box-shadow: var(--shadow); }
    .footer-grid { display: grid; grid-template-columns: 1.2fr repeat(3, minmax(0, 1fr)); gap: 22px; }
    .footer-grid h2 { margin: 0 0 14px; font-size: 15px; letter-spacing: 0.01em; }
    .footer-brand-row { display: flex; gap: 14px; align-items: flex-start; }
    .footer-brand .brand-mark { flex-shrink: 0; }
    .footer-brand p { margin: 8px 0 0; color: rgba(236,254,255,0.72); }
    .footer-links { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .footer-links a { color: rgba(236,254,255,0.72); }
    .footer-links a:hover { color: #ffffff; }
    .footer-bottom { margin-top: 24px; padding-top: 18px; border-top: 1px solid rgba(236,254,255,0.12); display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; color: rgba(236,254,255,0.62); font-size: 13px; }
    @media (max-width: 980px) {
      .hero-grid, .split-grid, .article-layout, .footer-grid { grid-template-columns: 1fr; }
      .sidebar-card { position: static; }
      .hero h1, .article-shell h1 { max-width: none; }
    }
    @media (max-width: 720px) {
      .shell { padding: 16px 14px 48px; }
      .topbar, .hero, .article-shell, .card, .site-footer, .sidebar-card, .post-card { border-radius: 24px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .nav { width: 100%; justify-content: flex-start; }
      .hero, .article-shell, .card, .sidebar-card, .site-footer { padding: 20px; }
      .hero-stats { grid-template-columns: 1fr; }
      .post-card-body h2 { font-size: 22px; }
      .article-shell p, .article-shell li { font-size: 16px; }
    }
  `;
}

function buildLayoutHtml(input: { title: string; description: string; canonicalUrl: string; ogImage?: string | null; structuredData?: Record<string, unknown> | Record<string, unknown>[]; body: string; ogType?: "article" | "website" | "profile"; extraMeta?: string; }) {
  const structuredData = input.structuredData ? `<script type="application/ld+json">${JSON.stringify(input.structuredData)}</script>` : "";
  const pageUrl = new URL(input.canonicalUrl);
  const ogImage = input.ogImage ? new URL(input.ogImage, pageUrl).toString() : new URL("/uploads/blog-assets/default-blog.svg", pageUrl).toString();
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(input.title)}</title><meta name="description" content="${escapeHtml(input.description)}" /><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" /><meta name="theme-color" content="#0f766e" /><link rel="canonical" href="${escapeHtml(input.canonicalUrl)}" /><meta property="og:site_name" content="AgenteZap" /><meta property="og:title" content="${escapeHtml(input.title)}" /><meta property="og:description" content="${escapeHtml(input.description)}" /><meta property="og:type" content="${input.ogType || "article"}" /><meta property="og:url" content="${escapeHtml(input.canonicalUrl)}" /><meta property="og:image" content="${escapeHtml(ogImage)}" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${escapeHtml(ogImage)}" />${input.extraMeta || ""}<style>${buildPublicStyles()}</style>${structuredData}</head><body>${input.body}</body></html>`;
}

async function getPublishedPostsFromDb(limit = 24): Promise<BlogPost[]> {
  return db.select().from(blogPosts).where(eq(blogPosts.status, "published")).orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt)).limit(limit);
}

async function syncSearchConsoleMetrics(config: BlogConfig): Promise<number> {
  const sc = await resolveSearchConsoleClient(config);
  if (!sc) return 0;

  const posts = await getPublishedPostsFromDb(150);
  if (posts.length === 0) return 0;

  const endDate = toIsoDate(new Date());
  const startDate = toIsoDate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
  const response = await sc.client.searchanalytics.query({
    siteUrl: sc.siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 250,
      type: "web",
    },
  });

  const rows = response.data.rows || [];
  const byUrl = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const pageUrl = row.keys?.[0];
    if (pageUrl) byUrl.set(pageUrl, row);
  }

  let synced = 0;
  for (const post of posts) {
    const row = byUrl.get(post.canonicalUrl);
    if (!row) continue;

    await db.insert(blogPostMetrics).values({
      postId: post.id,
      metricDate: endDate,
      clicks: Math.round(row.clicks || 0),
      impressions: Math.round(row.impressions || 0),
      ctr: String(row.ctr || 0),
      position: String(row.position || 0),
      source: "search_console",
      payload: row as Record<string, unknown>,
    }).onConflictDoUpdate({
      target: [blogPostMetrics.postId, blogPostMetrics.metricDate, blogPostMetrics.source],
      set: {
        clicks: Math.round(row.clicks || 0),
        impressions: Math.round(row.impressions || 0),
        ctr: String(row.ctr || 0),
        position: String(row.position || 0),
        payload: row as Record<string, unknown>,
      },
    });

    synced += 1;
  }

  return synced;
}

export async function ensureBlogInfrastructure(): Promise<void> {
  if (ensureBlogInfrastructurePromise) return ensureBlogInfrastructurePromise;

  ensureBlogInfrastructurePromise = (async () => {
    await ensureBlogAssetDir();
    const sqlFile = await fs.readFile(BLOG_MIGRATION_FILE, "utf8");
    await db.execute(sql.raw(sqlFile));
    const config = await resolveBlogConfig();
    await ensureAuthorProfiles(config);
  })();

  return ensureBlogInfrastructurePromise;
}

export async function discoverBlogTopics(limit = 8): Promise<{ created: number; skipped: number }> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  if (!config.discoveryEnabled) return { created: 0, skipped: 0 };

  const candidates = getFirstPartyDiscoverySeeds().map((seed) => ({
    keyword: seed.keyword,
    title: seed.title,
    cluster: seed.cluster,
    category: seed.category,
    intent: seed.intent,
    funnel: seed.funnel,
    score: 60,
    sourceSummary: "Seed editorial do proprio produto e da central de ajuda.",
  }));

  const searchConsole = await resolveSearchConsoleClient(config);
  if (searchConsole) {
    try {
      const endDate = toIsoDate(new Date());
      const startDate = toIsoDate(new Date(Date.now() - 28 * 24 * 60 * 60 * 1000));
      const response = await searchConsole.client.searchanalytics.query({
        siteUrl: searchConsole.siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: 20,
          type: "web",
        },
      });

      const rawQueries = (response.data.rows || []).map((row) => ({
        keyword: normalizeWhitespace(String(row.keys?.[0] || "")),
        impressions: Math.round(row.impressions || 0),
        clicks: Math.round(row.clicks || 0),
        ctr: Number(row.ctr || 0),
      })).filter((row) => row.keyword);

      if (rawQueries.length > 0) {
        const classified = await callBlogJsonTask({
          taskName: "search-console-discovery",
          model: config.textModel,
          schema: discoverySelectionSchema,
          prompt: "VocÃª classifica queries de Search Console em pautas de blog Ãºteis para um SaaS de WhatsApp, IA, CRM e automaÃ§Ã£o comercial. Ignore queries sem aderÃªncia real ao produto.",
          userMessage: JSON.stringify({
            brandName: config.brandName,
            helpCategories: HELP_CATEGORIES_META.map((item) => ({ id: item.id, title: item.title })),
            queries: rawQueries,
          }),
          maxTokens: 1400,
        }).catch(() => ({ candidates: [] }));

        for (const candidate of classified.candidates) {
          candidates.push(candidate);
        }
      }
    } catch (error) {
      console.error("[BLOG] Falha ao consultar Search Console na descoberta:", error);
    }
  }

  const existingKeywordsRows = await db.select({ keywordPrimary: blogTopics.keywordPrimary }).from(blogTopics);
  const existingPostKeywords = await db.select({ keywordPrimary: blogPosts.keywordPrimary }).from(blogPosts);
  const existingKeywords = new Set([...existingKeywordsRows.map((row) => row.keywordPrimary.toLowerCase()), ...existingPostKeywords.map((row) => row.keywordPrimary.toLowerCase())]);

  let created = 0;
  let skipped = 0;
  const sortedCandidates = candidates.sort((a, b) => b.score - a.score).slice(0, limit * 2);

  for (const candidate of sortedCandidates) {
    const keywordKey = candidate.keyword.toLowerCase();
    if (existingKeywords.has(keywordKey)) {
      skipped += 1;
      continue;
    }

    const brief = buildBriefFromCandidate(candidate);
    await db.insert(blogTopics).values({
      status: "pending" satisfies TopicStatus,
      titleHint: brief.titleHint,
      keywordPrimary: brief.keywordPrimary,
      keywordsSecondary: brief.keywordsSecondary,
      cluster: brief.cluster,
      categorySlug: brief.categorySlug,
      intent: brief.intent,
      funnelStage: brief.funnelStage,
      sourceType: searchConsole && candidate.sourceSummary.includes("Search Console") ? "search_console" : "seed",
      sourceData: { sourceSummary: brief.sourceSummary },
      briefJson: brief as unknown as Record<string, unknown>,
      score: candidate.score,
    }).onConflictDoNothing({ target: blogTopics.keywordPrimary });

    existingKeywords.add(keywordKey);
    created += 1;
    if (created >= limit) break;
  }

  return { created, skipped };
}

async function getTopicById(topicId: string): Promise<BlogTopic | undefined> {
  const rows = await db.select().from(blogTopics).where(eq(blogTopics.id, topicId)).limit(1);
  return rows[0];
}

async function getPostById(postId: string): Promise<BlogPost | undefined> {
  const rows = await db.select().from(blogPosts).where(eq(blogPosts.id, postId)).limit(1);
  return rows[0];
}

export async function generateBlogPostFromTopic(topicId?: string, options?: { autoPublish?: boolean; refreshPostId?: string }): Promise<BlogPost> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  const refreshTargetPost = options?.refreshPostId ? await getPostById(options.refreshPostId) : null;

  let topic: BlogTopic | undefined;
  if (topicId) {
    topic = await getTopicById(topicId);
  } else {
    topic = await db.select().from(blogTopics).where(eq(blogTopics.status, "pending")).orderBy(desc(blogTopics.score), desc(blogTopics.createdAt)).limit(1).then((rows) => rows[0]);
  }
  if (!topic) throw new Error("Nenhum topic pendente encontrado");

  const job = await createGenerationJob(options?.refreshPostId ? "refresh" : "generate", topic.id, options?.refreshPostId || null);

  try {
    const brief = (topic.briefJson || {}) as unknown as BlogBrief;
    const authorProfile = await selectAuthorProfileForBrief(config, brief);
    const existingPosts = await db.select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      bodyHtml: blogPosts.bodyHtml,
      cluster: blogPosts.cluster,
      categorySlug: blogPosts.categorySlug,
    }).from(blogPosts).where(eq(blogPosts.status, "published"));
    const { pack, references } = await buildContextPack(topic, brief, config, existingPosts);

    let draft: BlogDraft;
    try {
      draft = await generateDraftWithMistral(brief, config, pack, references);
    } catch (error) {
      console.error("[BLOG] Falha no draft Mistral, usando fallback:", error);
      draft = fallbackDraftFromBrief(brief);
    }
    if (!draft.sections || draft.sections.length === 0) {
      draft = fallbackDraftFromBrief(brief);
    }

    const slug = refreshTargetPost?.slug || slugify(draft.title);
    const canonicalUrl = `${config.baseUrl}/blog/${slug}`;
    const currentReview = (refreshTargetPost?.semanticReview as Record<string, unknown> | undefined) || null;

    let attempt = 1;
    let currentDraft = normalizeBlogDraft(draft, brief);
    let internalLinks = buildInternalLinks(config.baseUrl, currentDraft, existingPosts);
    let bodyHtml = renderBodyHtml(currentDraft, internalLinks);
    let gate = await evaluateQualityGate(currentDraft, bodyHtml, internalLinks, existingPosts, config, pack);
    let approvalPayload = buildPostApprovalPayload({
      gate,
      config,
      refreshReason: gate.notes[0] || null,
      currentReview,
    });

    while (attempt < config.autoRewriteAttempts && !approvalPayload.approval.meetsAutoPublishBar) {
      attempt += 1;
      currentDraft = await repairDraftForQualityGate({
        draft: currentDraft,
        brief,
        gate,
        approval: approvalPayload.approval,
        attempt,
        config,
        contextPack: pack,
        references,
      });
      internalLinks = buildInternalLinks(config.baseUrl, currentDraft, existingPosts);
      bodyHtml = renderBodyHtml(currentDraft, internalLinks);
      gate = await evaluateQualityGate(currentDraft, bodyHtml, internalLinks, existingPosts, config, pack);
      approvalPayload = buildPostApprovalPayload({
        gate,
        config,
        refreshReason: gate.notes[0] || null,
        currentReview: {
          ...currentReview,
          retryCount: attempt - 1,
          lastAutoRewriteAt: new Date().toISOString(),
        },
      });
    }

    draft = currentDraft;
    const readingTimeMinutes = readingTimeFromText(bodyHtml);
    const semanticReview = {
      ...approvalPayload.semanticReview,
      retryCount: attempt - 1,
      targetAttemptCount: config.autoRewriteAttempts,
      finalAttempt: attempt,
      authorName: authorProfile.name,
      authorRole: authorProfile.role,
      authorSlug: authorProfile.slug,
    };
    const approval = {
      ...approvalPayload.approval,
      improvementActions: semanticReview.meetsAutoPublishBar
        ? approvalPayload.approval.improvementActions
        : Array.from(new Set([
            ...approvalPayload.approval.improvementActions,
            "O autoblog tentou varias reescritas, mas o score ainda nao ficou forte o bastante para publicar sozinho.",
          ])),
    };
    const nextStatus = resolveBlogPostStatusAfterEditorialUpdate({
      currentStatus: refreshTargetPost?.status as "draft" | "ready" | "published" | "rejected" | "archived" | null,
      approvalDecision: approval.decision,
      isRefresh: Boolean(options?.refreshPostId),
    });
    const nextTopicStatus: TopicStatus = nextStatus === "published"
      ? "published"
      : approval.decision === "blocked"
        ? "blocked"
        : "generated";

    const basePayload = {
      topicId: topic.id,
      slug,
      status: nextStatus as PostStatus,
      title: draft.title,
      excerpt: draft.excerpt,
      bodyHtml,
      bodyJson: draft as unknown as Record<string, unknown>,
      faqJson: draft.faq,
      keywordPrimary: draft.keywordPrimary,
      keywordsSecondary: draft.keywordsSecondary,
      cluster: draft.cluster,
      categorySlug: draft.categorySlug,
      tags: draft.tags,
      intent: draft.intent,
      funnelStage: draft.funnelStage,
      metaTitle: draft.metaTitle || `${draft.title} | ${config.brandName}`,
      metaDescription: draft.metaDescription || draft.excerpt,
      canonicalUrl,
      authorSlug: authorProfile.slug,
      contextPackId: pack.id,
      heroImageAlt: `Imagem editorial sobre ${draft.title}`,
      imagePrompt: draft.imagePrompt,
      referencesJson: references as unknown as Array<Record<string, unknown>>,
      semanticReview,
      qualityScore: gate.qualityScore,
      duplicateSimilarity: String(gate.duplicateSimilarity),
      internalProofCount: gate.internalProofCount,
      requiredInternalLinks: gate.requiredInternalLinks,
      unsupportedClaims: gate.unsupportedClaims,
      sourceProvenance: {
        sourceSummary: brief.sourceSummary,
        internalProofs: draft.internalProofs,
        internalLinks: internalLinks.map((link) => link.href),
        author: {
          slug: authorProfile.slug,
          name: authorProfile.name,
          role: authorProfile.role,
        },
        generationAttempts: attempt,
      },
      reviewNotes: [...approval.blockingReasons, ...approval.improvementActions].join(" | "),
      distributionPayload: { linkedin: `${draft.title}\n\n${draft.excerpt}\n\nLeia no blog: ${canonicalUrl}`, whatsapp: `${draft.title} - ${canonicalUrl}` },
      readingTimeMinutes,
      modelProvider: "mistral",
      modelName: config.textModel,
      publishEligibleAt: new Date(Date.now() + gate.publishDelayHours * 60 * 60 * 1000),
      refreshReason: gate.notes[0] || null,
      lastRefreshAt: options?.refreshPostId ? new Date() : null,
      updatedAt: new Date(),
    };

    let post: BlogPost;
    if (options?.refreshPostId) {
      const [updated] = await db.update(blogPosts).set(basePayload).where(eq(blogPosts.id, options.refreshPostId)).returning();
      post = updated;
    } else {
      const [created] = await db.insert(blogPosts).values(basePayload).returning();
      post = created;
    }

    const jsonLd = buildArticleJsonLd(post, config, draft.faq, authorProfile);
    const [finalPost] = await db.update(blogPosts).set({ jsonLd, updatedAt: new Date() }).where(eq(blogPosts.id, post.id)).returning();
    post = finalPost;

    await db.insert(blogPostRevisions).values({
      postId: post.id,
      revisionType: options?.refreshPostId ? "refresh" : "draft",
      bodyHtml: post.bodyHtml,
      bodyJson: draft as unknown as Record<string, unknown>,
      qualityScore: gate.qualityScore,
      notes: gate.notes.join(" | "),
    });

    await db.insert(blogPostSources).values({
      postId: post.id,
      topicId: topic.id,
      sourceType: topic.sourceType,
      sourceKey: topic.keywordPrimary,
      payload: topic.sourceData as Record<string, unknown>,
    });
    await db.insert(blogPostSources).values(references.map((reference) => ({
      postId: post.id,
      topicId: topic.id,
      sourceType: reference.sourceType,
      sourceKey: reference.label,
      sourceUrl: reference.href,
      payload: reference as unknown as Record<string, unknown>,
    })));

    await db.update(blogTopics).set({
      status: nextTopicStatus,
      publishedPostId: post.id,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(blogTopics.id, topic.id));

    await finishGenerationJob(job.id, "completed", { postId: post.id, quality: gate, approval }, undefined);
    if (options?.autoPublish && approval.canAutoPublish) {
      return autoPublishIfAllowed(post);
    }
    return post;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    await finishGenerationJob(job.id, "failed", {}, message);
    throw error;
  }
}

export async function publishBlogPost(postId: string, options?: { force?: boolean }): Promise<BlogPost> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  if (blogPublishLocks.has(postId)) {
    throw new Error("Publicacao deste post ja esta em andamento");
  }
  blogPublishLocks.add(postId);
  const post = await getPostById(postId);
  if (!post) {
    blogPublishLocks.delete(postId);
    throw new Error("Post nao encontrado");
  }

  const publishJob = await createPublishJob(post.id, { action: "publish" });

  try {
    if (post.status === "archived") {
      throw new Error("Post arquivado. Restaure antes de publicar.");
    }
    if (post.status === "rejected" && !options?.force) {
      throw new Error("Post rejeitado pelo quality gate");
    }
    if (post.publishEligibleAt && new Date(post.publishEligibleAt) > new Date() && !options?.force) {
      throw new Error("Post ainda esta dentro da janela de governanca editorial");
    }

    const cadence = await getPublishingCadenceStatus(post);
    if (!cadence.canPublish && !options?.force) {
      throw new Error(cadence.reason || "Cadencia de publicacao bloqueou este post");
    }

    const asset = await ensureHeroImage(post, config, { requirePublishableAiImage: true });
    const imageVariants = await ensureSeoImageVariants(post, config);
    const [updatedPost] = await db.update(blogPosts).set({
      status: "published" satisfies PostStatus,
      heroImageId: asset.id,
      heroImageUrl: asset.publicUrl,
      heroImageAlt: asset.altText,
      sourceProvenance: {
        ...(typeof post.sourceProvenance === "object" && post.sourceProvenance ? post.sourceProvenance as Record<string, unknown> : {}),
        imageVariants,
      },
      publishedAt: post.publishedAt || new Date(),
      lastRefreshAt: post.publishedAt ? new Date() : post.lastRefreshAt,
      updatedAt: new Date(),
    }).where(eq(blogPosts.id, post.id)).returning();

    const authorProfile = updatedPost.authorSlug
      ? await db.select().from(blogAuthorProfiles).where(eq(blogAuthorProfiles.slug, updatedPost.authorSlug)).limit(1).then((rows) => rows[0])
      : null;
    const faq = normalizeFaq(updatedPost.faqJson);
    const jsonLd = buildArticleJsonLd(updatedPost, config, faq, authorProfile || null);
    const [publishedPost] = await db.update(blogPosts).set({ jsonLd, updatedAt: new Date() }).where(eq(blogPosts.id, updatedPost.id)).returning();

    if (publishedPost.topicId) {
      await db.update(blogTopics).set({
        status: "published" satisfies TopicStatus,
        publishedPostId: publishedPost.id,
        updatedAt: new Date(),
      }).where(eq(blogTopics.id, publishedPost.topicId));
    }

    const sitemapResult = await submitBlogSitemap();
    const inspection = await inspectBlogPostUrl(publishedPost.id).catch((error) => ({ success: false, error: error instanceof Error ? error.message : "erro" }));
    await finishPublishJob(publishJob.id, "completed", { sitemapResult, inspection });
    return publishedPost;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    await finishPublishJob(publishJob.id, "failed", {}, message);
    throw error;
  } finally {
    blogPublishLocks.delete(postId);
  }
}

export async function refreshBlogPost(postId?: string): Promise<BlogPost | null> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  if (!config.refreshEnabled) return null;

  await syncSearchConsoleMetrics(config).catch((error) => {
    console.error("[BLOG] Falha ao sincronizar metricas antes do refresh:", error);
  });

  let targetPost: BlogPost | undefined;
  if (postId) {
    targetPost = await getPostById(postId);
  } else {
    const latestMetrics = await db.select().from(blogPostMetrics).orderBy(desc(blogPostMetrics.metricDate)).limit(100);
    const publishedCandidates = await db.select().from(blogPosts)
      .where(and(eq(blogPosts.status, "published"), isNotNull(blogPosts.publishedAt)))
      .orderBy(sql`${blogPosts.lastRefreshAt} asc nulls first`, desc(blogPosts.publishedAt))
      .limit(5);

    if (publishedCandidates.length > 0) {
      const decision = await callBlogJsonTask({
        taskName: "refresh-decision",
        model: config.textModel,
        schema: refreshDecisionSchema,
        prompt: "VocÃª escolhe qual artigo jÃ¡ publicado merece refresh primeiro. Priorize post com baixa traÃ§Ã£o orgÃ¢nica ou conteÃºdo mais antigo, mas ignore refresh se a lista estiver saudÃ¡vel.",
        userMessage: JSON.stringify({
          candidates: publishedCandidates.map((candidate) => ({
            postId: candidate.id,
            title: candidate.title,
            keywordPrimary: candidate.keywordPrimary,
            cluster: candidate.cluster,
            publishedAt: candidate.publishedAt,
            lastRefreshAt: candidate.lastRefreshAt,
            metrics: latestMetrics.filter((metric) => metric.postId === candidate.id).slice(0, 3),
          })),
        }),
        maxTokens: 900,
      }).catch(() => ({ postId: publishedCandidates[0]?.id || "", reason: "fallback" }));

      if (decision.postId) {
        targetPost = publishedCandidates.find((candidate) => candidate.id === decision.postId) || publishedCandidates[0];
      }
    }
  }

  if (!targetPost) return null;

  let topicId = targetPost.topicId;
  if (!topicId) {
    const brief = buildBriefFromCandidate({
      keyword: targetPost.keywordPrimary,
      title: targetPost.title,
      cluster: targetPost.cluster,
      category: targetPost.categorySlug,
      intent: targetPost.intent as BlogIntent,
      funnel: targetPost.funnelStage as FunnelStage,
      sourceSummary: "Topic sintetizado a partir de post ja publicado",
    });
    const [topic] = await db.insert(blogTopics).values({
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
      briefJson: brief as unknown as Record<string, unknown>,
      score: 50,
      publishedPostId: targetPost.id,
    }).returning();
    topicId = topic.id;
  }

  return generateBlogPostFromTopic(topicId, { autoPublish: true, refreshPostId: targetPost.id });
}

export async function reviewBlogPost(postId: string): Promise<BlogPost> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  const post = await getPostById(postId);
  if (!post) throw new Error("Post nao encontrado");

  const draft = normalizeDraftFromStoredPost(post);
  const existingPosts = await db.select({
    id: blogPosts.id,
    slug: blogPosts.slug,
    title: blogPosts.title,
    excerpt: blogPosts.excerpt,
    bodyHtml: blogPosts.bodyHtml,
    cluster: blogPosts.cluster,
    categorySlug: blogPosts.categorySlug,
  }).from(blogPosts).where(eq(blogPosts.status, "published"));
  const comparablePosts = existingPosts.filter((item) => item.id !== post.id);
  const internalLinks = normalizeInternalLinksFromPost(post);
  const effectiveLinks = internalLinks.length >= 4 ? internalLinks : buildInternalLinks(config.baseUrl, draft, comparablePosts);
  const contextPack = post.contextPackId
    ? await db.select().from(blogContextPacks).where(eq(blogContextPacks.id, post.contextPackId)).limit(1).then((rows) => rows[0] || null)
    : null;
  const gate = await evaluateQualityGate(draft, post.bodyHtml, effectiveLinks, comparablePosts, config, contextPack);
  const { approval, semanticReview } = buildPostApprovalPayload({
    gate,
    config,
    refreshReason: gate.notes[0] || post.refreshReason || null,
    currentReview: typeof post.semanticReview === "object" ? post.semanticReview as Record<string, unknown> : null,
  });

  const nextStatus: PostStatus = post.status === "published" || post.status === "archived"
    ? post.status as PostStatus
    : approval.decision === "blocked" ? "rejected" : "ready";

  const [updated] = await db.update(blogPosts).set({
    status: nextStatus,
    semanticReview,
    qualityScore: gate.qualityScore,
    duplicateSimilarity: String(gate.duplicateSimilarity),
    internalProofCount: gate.internalProofCount,
    requiredInternalLinks: gate.requiredInternalLinks,
    unsupportedClaims: gate.unsupportedClaims,
    reviewNotes: [...approval.blockingReasons, ...approval.improvementActions].join(" | "),
    publishEligibleAt: new Date(Date.now() + gate.publishDelayHours * 60 * 60 * 1000),
    refreshReason: gate.notes[0] || post.refreshReason,
    sourceProvenance: {
      ...(typeof post.sourceProvenance === "object" && post.sourceProvenance ? post.sourceProvenance as Record<string, unknown> : {}),
      internalProofs: draft.internalProofs,
      internalLinks: effectiveLinks.map((link) => link.href),
      lastReviewMode: "ai-audit",
    },
    updatedAt: new Date(),
  }).where(eq(blogPosts.id, post.id)).returning();

  await db.insert(blogPostRevisions).values({
    postId: updated.id,
    revisionType: "review",
    bodyHtml: updated.bodyHtml,
    bodyJson: typeof updated.bodyJson === "object" && updated.bodyJson ? updated.bodyJson as Record<string, unknown> : {},
    qualityScore: updated.qualityScore,
    notes: [...approval.blockingReasons, ...approval.improvementActions].join(" | "),
  });

  if (updated.status !== "published" && approval.canAutoPublish) {
    return autoPublishIfAllowed(updated);
  }

  return updated;
}

export async function editBlogPostWithAi(postId: string, instruction: string): Promise<BlogPost> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  const post = await getPostById(postId);
  if (!post) throw new Error("Post nao encontrado");
  if (!instruction.trim()) throw new Error("Instrucao obrigatoria para editar com IA");

  const contextPack = post.contextPackId
    ? await db.select().from(blogContextPacks).where(eq(blogContextPacks.id, post.contextPackId)).limit(1).then((rows) => rows[0] || null)
    : null;
  const references = Array.isArray(post.referencesJson)
    ? (post.referencesJson as Array<Record<string, unknown>>).map((item) => ({
        label: String(item.label || item.href || "fonte"),
        href: String(item.href || "#"),
        sourceType: String(item.sourceType || "reference"),
        description: String(item.description || ""),
      }))
    : [];
  const baseBrief = buildBriefFromPost(post);
  const authorProfile = await selectAuthorProfileForBrief(config, baseBrief);
  let revisedDraft = await reviseDraftWithMistral({
    post,
    instruction,
    config,
    contextPack,
    references,
  });

  const existingPosts = await db.select({
    id: blogPosts.id,
    slug: blogPosts.slug,
    title: blogPosts.title,
    excerpt: blogPosts.excerpt,
    bodyHtml: blogPosts.bodyHtml,
    cluster: blogPosts.cluster,
    categorySlug: blogPosts.categorySlug,
  }).from(blogPosts).where(eq(blogPosts.status, "published"));
  const comparablePosts = existingPosts.filter((item) => item.id !== post.id);
  let attempt = 1;
  let internalLinks = buildInternalLinks(config.baseUrl, revisedDraft, comparablePosts);
  let bodyHtml = renderBodyHtml(revisedDraft, internalLinks);
  let gate = await evaluateQualityGate(revisedDraft, bodyHtml, internalLinks, comparablePosts, config, contextPack);
  let approvalPayload = buildPostApprovalPayload({
    gate,
    config,
    refreshReason: `Editado com IA: ${instruction.trim().slice(0, 140)}`,
    currentReview: typeof post.semanticReview === "object" ? post.semanticReview as Record<string, unknown> : null,
  });

  while (attempt < config.autoRewriteAttempts && !approvalPayload.approval.meetsAutoPublishBar) {
    attempt += 1;
    revisedDraft = await repairDraftForQualityGate({
      draft: revisedDraft,
      brief: {
        ...baseBrief,
        titleHint: revisedDraft.title,
        keywordPrimary: revisedDraft.keywordPrimary,
        keywordsSecondary: revisedDraft.keywordsSecondary,
        cluster: revisedDraft.cluster,
        categorySlug: revisedDraft.categorySlug,
        intent: revisedDraft.intent,
        funnelStage: revisedDraft.funnelStage,
        internalProofs: revisedDraft.internalProofs,
      },
      gate,
      approval: approvalPayload.approval,
      attempt,
      config,
      contextPack,
      references,
    });
    internalLinks = buildInternalLinks(config.baseUrl, revisedDraft, comparablePosts);
    bodyHtml = renderBodyHtml(revisedDraft, internalLinks);
    gate = await evaluateQualityGate(revisedDraft, bodyHtml, internalLinks, comparablePosts, config, contextPack);
    approvalPayload = buildPostApprovalPayload({
      gate,
      config,
      refreshReason: `Editado com IA: ${instruction.trim().slice(0, 140)}`,
      currentReview: {
        ...(typeof post.semanticReview === "object" ? post.semanticReview as Record<string, unknown> : {}),
        retryCount: attempt - 1,
      },
    });
  }

  const approval = approvalPayload.approval;
  const semanticReview = {
    ...approvalPayload.semanticReview,
    retryCount: attempt - 1,
    targetAttemptCount: config.autoRewriteAttempts,
    finalAttempt: attempt,
    authorName: authorProfile.name,
    authorRole: authorProfile.role,
    authorSlug: authorProfile.slug,
  };

  const nextStatus: PostStatus = post.status === "published" || post.status === "archived"
    ? post.status as PostStatus
    : approval.decision === "blocked" ? "rejected" : "ready";

  const sourceProvenance = typeof post.sourceProvenance === "object" && post.sourceProvenance
    ? post.sourceProvenance as Record<string, unknown>
    : {};
  const editHistory = Array.isArray(sourceProvenance.editHistory) ? sourceProvenance.editHistory as Array<Record<string, unknown>> : [];

  const [updated] = await db.update(blogPosts).set({
    status: nextStatus,
    title: revisedDraft.title,
    excerpt: revisedDraft.excerpt,
    bodyHtml,
    bodyJson: revisedDraft as unknown as Record<string, unknown>,
    faqJson: revisedDraft.faq,
    keywordPrimary: revisedDraft.keywordPrimary,
    keywordsSecondary: revisedDraft.keywordsSecondary,
    cluster: revisedDraft.cluster,
    categorySlug: revisedDraft.categorySlug,
    tags: revisedDraft.tags,
    intent: revisedDraft.intent,
    funnelStage: revisedDraft.funnelStage,
    metaTitle: revisedDraft.metaTitle,
    metaDescription: revisedDraft.metaDescription,
    imagePrompt: revisedDraft.imagePrompt,
    authorSlug: authorProfile.slug,
    semanticReview,
    qualityScore: gate.qualityScore,
    duplicateSimilarity: String(gate.duplicateSimilarity),
    internalProofCount: gate.internalProofCount,
    requiredInternalLinks: gate.requiredInternalLinks,
    unsupportedClaims: gate.unsupportedClaims,
    reviewNotes: [...approval.blockingReasons, ...approval.improvementActions].join(" | "),
    sourceProvenance: {
      ...sourceProvenance,
      internalProofs: revisedDraft.internalProofs,
      internalLinks: internalLinks.map((link) => link.href),
      author: {
        slug: authorProfile.slug,
        name: authorProfile.name,
        role: authorProfile.role,
      },
      generationAttempts: attempt,
      editHistory: [
        ...editHistory.slice(-4),
        { mode: "ai", instruction, at: new Date().toISOString(), attempts: attempt },
      ],
    },
    readingTimeMinutes: readingTimeFromText(bodyHtml),
    publishEligibleAt: new Date(Date.now() + gate.publishDelayHours * 60 * 60 * 1000),
    refreshReason: `Editado com IA: ${instruction.trim().slice(0, 140)}`,
    lastRefreshAt: post.status === "published" ? new Date() : post.lastRefreshAt,
    updatedAt: new Date(),
  }).where(eq(blogPosts.id, post.id)).returning();

  const persistedAuthorProfile = updated.authorSlug
    ? await db.select().from(blogAuthorProfiles).where(eq(blogAuthorProfiles.slug, updated.authorSlug)).limit(1).then((rows) => rows[0])
    : null;
  const jsonLd = buildArticleJsonLd(updated, config, revisedDraft.faq, persistedAuthorProfile || authorProfile);
  const [finalPost] = await db.update(blogPosts).set({ jsonLd, updatedAt: new Date() }).where(eq(blogPosts.id, updated.id)).returning();

  await db.insert(blogPostRevisions).values({
    postId: finalPost.id,
    revisionType: "ai-edit",
    bodyHtml: finalPost.bodyHtml,
    bodyJson: revisedDraft as unknown as Record<string, unknown>,
    qualityScore: finalPost.qualityScore,
    notes: `Instrucao: ${instruction}`,
  });

  if (finalPost.topicId && finalPost.status !== "published") {
    await db.update(blogTopics).set({
      status: (approval.decision === "blocked" ? "blocked" : "generated") satisfies TopicStatus,
      updatedAt: new Date(),
    }).where(eq(blogTopics.id, finalPost.topicId));
  }

  if (finalPost.status !== "published" && approval.canAutoPublish) {
    return autoPublishIfAllowed(finalPost);
  }

  return finalPost;
}

export async function archiveBlogPost(postId: string, reason?: string): Promise<BlogPost> {
  await ensureBlogInfrastructure();
  const post = await getPostById(postId);
  if (!post) throw new Error("Post nao encontrado");

  const sourceProvenance = typeof post.sourceProvenance === "object" && post.sourceProvenance
    ? post.sourceProvenance as Record<string, unknown>
    : {};

  const [updated] = await db.update(blogPosts).set({
    status: "archived" satisfies PostStatus,
    sourceProvenance: {
      ...sourceProvenance,
      lifecycle: {
        previousStatus: post.status,
        archivedAt: new Date().toISOString(),
        archivedReason: reason || "Arquivado manualmente no painel Blog SEO",
      },
    },
    updatedAt: new Date(),
  }).where(eq(blogPosts.id, post.id)).returning();

  if (updated.topicId) {
    await db.update(blogTopics).set({
      status: "blocked" satisfies TopicStatus,
      updatedAt: new Date(),
    }).where(eq(blogTopics.id, updated.topicId));
  }

  return updated;
}

export async function restoreArchivedBlogPost(postId: string): Promise<BlogPost> {
  await ensureBlogInfrastructure();
  const post = await getPostById(postId);
  if (!post) throw new Error("Post nao encontrado");
  if (post.status !== "archived") throw new Error("Post nao esta arquivado");

  const nextStatus = getArchivedStatusFallback(post);
  const sourceProvenance = typeof post.sourceProvenance === "object" && post.sourceProvenance
    ? post.sourceProvenance as Record<string, unknown>
    : {};
  const lifecycle = typeof sourceProvenance.lifecycle === "object" && sourceProvenance.lifecycle
    ? sourceProvenance.lifecycle as Record<string, unknown>
    : {};

  const [updated] = await db.update(blogPosts).set({
    status: nextStatus,
    sourceProvenance: {
      ...sourceProvenance,
      lifecycle: {
        ...lifecycle,
        restoredAt: new Date().toISOString(),
      },
    },
    updatedAt: new Date(),
  }).where(eq(blogPosts.id, post.id)).returning();

  if (updated.topicId) {
    await db.update(blogTopics).set({
      status: (nextStatus === "published" ? "published" : nextStatus === "rejected" ? "blocked" : "generated") satisfies TopicStatus,
      updatedAt: new Date(),
    }).where(eq(blogTopics.id, updated.topicId));
  }

  return updated;
}

async function reviewNextRecoverablePost(): Promise<BlogPost | null> {
  const config = await resolveBlogConfig();
  const candidate = await db.select({
    id: blogPosts.id,
  }).from(blogPosts)
    .where(inArray(blogPosts.status, ["ready", "rejected"]))
    .orderBy(desc(blogPosts.qualityScore), desc(blogPosts.updatedAt))
    .limit(1)
    .then((rows) => rows[0] || null);

  if (!candidate) return null;

  try {
    const reviewed = await reviewBlogPost(candidate.id);
    if (reviewed.status === "published" || reviewed.status === "archived") {
      return reviewed;
    }

    const review = typeof reviewed.semanticReview === "object" && reviewed.semanticReview
      ? reviewed.semanticReview as Record<string, unknown>
      : {};
    const retryCount = Number(review.retryCount || 0);
    const meetsAutoPublishBar = Boolean(review.meetsAutoPublishBar);
    if (meetsAutoPublishBar || retryCount >= config.autoRewriteAttempts) {
      return reviewed;
    }

    const blockingReasons = Array.isArray(review.blockingReasons)
      ? review.blockingReasons.map((item) => String(item || "")).filter(Boolean)
      : [];

    return await editBlogPostWithAi(
      candidate.id,
      [
        "Reescreva este artigo para passar no gate do autoblog.",
        "Aumente utilidade real, criterio de decisao, prova do produto e clareza.",
        "Elimine frases genericas, SEO mecanico e qualquer trecho que pareca template.",
        `Bloqueios atuais: ${blockingReasons.join(" | ") || "sem bloqueio explicito, mas o score ainda nao atingiu a meta"}.`,
      ].join(" "),
    );
  } catch (error) {
    console.error("[BLOG] Falha ao revisar post travado no ciclo automatico:", error);
    return null;
  }
}

function isGovernanceDeferredPublishError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    "Ja existe post publicado hoje",
    "Post ainda esta dentro da janela de governanca editorial",
    "Cadencia de publicacao bloqueou este post",
  ].some((message) => error.message.includes(message));
}

async function autoPublishIfAllowed(post: BlogPost): Promise<BlogPost> {
  const current = (await getPostById(post.id)) || post;
  if (current.publishEligibleAt && new Date(current.publishEligibleAt) > new Date()) {
    return current;
  }

  const cadence = await getPublishingCadenceStatus(current);
  if (!cadence.canPublish) {
    return current;
  }

  try {
    return await publishBlogPost(current.id);
  } catch (error) {
    if (isGovernanceDeferredPublishError(error)) {
      return (await getPostById(current.id)) || current;
    }
    throw error;
  }
}

export async function runDiscoveryGenerationPublishCycle(): Promise<{ discovered: number; generated?: string; published?: string }> {
  if (blogPipelineRunPromise) return blogPipelineRunPromise;

  blogPipelineRunPromise = (async () => {
    try {
      const recovered = await reviewNextRecoverablePost();
      if (recovered?.status === "published") {
        return {
          discovered: 0,
          generated: recovered.id,
          published: recovered.id,
        };
      }

      const discovery = await discoverBlogTopics(5);
      let generated: BlogPost | null = null;
      try {
        generated = await generateBlogPostFromTopic(undefined, { autoPublish: true });
      } catch (error) {
        console.error("[BLOG] Nenhum post gerado no ciclo automatico:", error);
      }

      return {
        discovered: discovery.created,
        generated: generated?.id,
        published: generated?.status === "published" ? generated.id : undefined,
      };
    } finally {
      blogPipelineRunPromise = null;
    }
  })();

  return blogPipelineRunPromise;
}

export async function submitBlogSitemap(): Promise<{ success: boolean; detail?: string }> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  const sc = await resolveSearchConsoleClient(config);
  const sitemapUrl = `${config.baseUrl}/sitemap-blog.xml`;
  if (!sc) return { success: false, detail: "Search Console nao configurado" };

  await sc.client.sitemaps.submit({
    siteUrl: sc.siteUrl,
    feedpath: sitemapUrl,
  });

  return { success: true, detail: sitemapUrl };
}

export async function inspectBlogPostUrl(postId: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  const sc = await resolveSearchConsoleClient(config);
  const post = await getPostById(postId);
  if (!post) throw new Error("Post nao encontrado para inspecao");
  if (!sc) return { success: false, error: "Search Console nao configurado" };

  const response = await sc.client.urlInspection.index.inspect({
    requestBody: {
      inspectionUrl: post.canonicalUrl,
      siteUrl: sc.siteUrl,
      languageCode: "pt-BR",
    },
  });

  const result = response.data.inspectionResult?.indexStatusResult;
  await db.insert(blogIndexingChecks).values({
    postId: post.id,
    inspectedUrl: post.canonicalUrl,
    inspectionType: "url_inspection",
    indexingState: result?.indexingState || null,
    coverageState: result?.coverageState || null,
    googleCanonical: result?.googleCanonical || null,
    userCanonical: result?.userCanonical || null,
    sitemaps: result?.sitemap || [],
    verdict: result?.verdict || null,
    rawResponse: response.data as Record<string, unknown>,
  });

  return { success: true, data: response.data as Record<string, unknown> };
}

export async function listPublicBlogPosts(params?: { category?: string; tag?: string; limit?: number }): Promise<PublicPostSummary[]> {
  const config = await resolveBlogConfig();
  const posts = await getPublishedPublicPosts(config, params?.limit || 24);
  return posts
    .filter((post) => !params?.category || post.categorySlug === params.category)
    .filter((post) => !params?.tag || (Array.isArray(post.tags) && post.tags.includes(params.tag)))
    .map(mapPostSummary);
}

export async function getPublicBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const config = await resolveBlogConfig();
  if (isLocalBlogFixtureMode()) {
    await ensureBlogInfrastructure();
    const rows = await db.select().from(blogPosts).where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published"))).limit(1);
    if (rows[0]) return rows[0];
    return createFixturePublishedPosts(config).find((post) => post.slug === slug);
  }
  await ensureBlogInfrastructure();
  const rows = await db.select().from(blogPosts).where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published"))).limit(1);
  return rows[0];
}

export async function listPublicBlogCategories() {
  const posts = await listPublicBlogPosts({ limit: 200 });
  const counts = new Map<string, number>();
  for (const post of posts) counts.set(post.categorySlug, (counts.get(post.categorySlug) || 0) + 1);
  return Array.from(counts.entries()).map(([slug, count]) => ({ slug, count, href: `/blog/categoria/${slug}` })).sort((a, b) => b.count - a.count);
}

export async function listPublicBlogTags() {
  const posts = await listPublicBlogPosts({ limit: 200 });
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([slug, count]) => ({ slug, count, href: `/blog/tag/${slug}` })).sort((a, b) => b.count - a.count);
}

export async function buildBlogHomepageHtml(): Promise<string> {
  const config = await resolveBlogConfig();
  const posts = await listPublicBlogPosts({ limit: 12 });
  const categories = await listPublicBlogCategories();
  const tags = await listPublicBlogTags();
  const featured = posts[0] || null;
  const recent = featured ? posts.slice(1) : posts;
  const body = `<div class="page-bg"><div class="shell">
    ${renderBlogHeader(config)}
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="eyebrow">Blog</span>
          <h1>Guias para vender, atender e agendar melhor no WhatsApp.</h1>
          <p>Artigos práticos para quem quer organizar operação, reduzir gargalo e tomar decisões melhores com IA, CRM, agenda e follow-up no mesmo fluxo.</p>
          <div class="hero-actions">
            <a class="button" href="/cadastro">Criar conta gratis</a>
            <a class="button-secondary" href="/ajuda">Ver central de ajuda</a>
          </div>
          <div class="hero-stats">
            <div class="stat-card"><strong>${posts.length}</strong><span>artigos visiveis agora</span></div>
            <div class="stat-card"><strong>${categories.length}</strong><span>temas principais para explorar</span></div>
            <div class="stat-card"><strong>${tags.length}</strong><span>tags para aprofundar a leitura</span></div>
          </div>
        </div>
        <aside class="hero-highlight">
          <span class="eyebrow">Destaque</span>
          ${featured ? `<h2><a href="/blog/${escapeHtml(featured.slug)}">${escapeHtml(featured.title)}</a></h2><p>${escapeHtml(featured.excerpt)}</p><ul><li>problema operacional real</li><li>passos praticos para implementar</li><li>links para continuar a leitura</li></ul><a class="text-link" href="/blog/${escapeHtml(featured.slug)}">Abrir artigo em destaque</a>` : `<h2>O blog esta sendo preparado</h2><p>Assim que houver posts publicados, o destaque aparecera aqui com um guia principal e leituras relacionadas.</p>`}
        </aside>
      </div>
    </section>
    ${featured ? `<section><div class="section-head"><div><h2>Comece por aqui</h2><p>Se esta chegando agora, este artigo resume um problema importante e leva para os proximos temas relacionados.</p></div></div>${renderPostCard(featured, config, { featured: true })}</section>` : ""}
    <section style="margin-top:28px;">
      <div class="section-head"><div><h2>Artigos recentes</h2><p>Leituras para resolver dúvidas comuns de atendimento, vendas, agenda, CRM e automação no WhatsApp.</p></div></div>
      <div class="grid posts">${recent.map((post) => renderPostCard(post, config)).join("")}</div>
    </section>
    <section class="split-grid">
      <div class="card">
        <div class="section-head"><div><h2>Temas para explorar</h2><p>Navegue pelos assuntos principais do blog e siga pelos artigos relacionados de cada tema.</p></div></div>
        <ul class="pill-list">${categories.map((category) => `<li><a href="${escapeHtml(category.href)}">${escapeHtml(humanizeSlug(category.slug))} (${category.count})</a></li>`).join("")}</ul>
      </div>
      <div class="card">
        <div class="section-head"><div><h2>Como usar o blog</h2><p>Se voce quer sair da descoberta para a implementacao, siga uma sequencia simples de leitura.</p></div></div>
        <ul>
          <li>comece por um artigo do seu tema principal</li>
          <li>abra a categoria para ver outros cenarios parecidos</li>
          <li>use a central de ajuda quando quiser aplicar no produto</li>
        </ul>
        <div class="hero-actions">
          <a class="button-secondary" href="/blog">Ver todos os artigos</a>
          <a class="button-secondary" href="/cadastro">Criar conta</a>
        </div>
      </div>
    </section>
    ${renderBlogFooter(config, categories, tags)}
  </div></div>`;

  return buildLayoutHtml({
    title: `Blog | ${config.brandName}`,
    description: `Blog do ${config.brandName} com artigos sobre IA no WhatsApp, CRM, atendimento e automacao comercial.`,
    canonicalUrl: `${config.baseUrl}/blog`,
    body,
    ogType: "website",
    structuredData: [
      buildOrganizationJsonLd(config),
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: `${config.brandName} Blog`,
        url: `${config.baseUrl}/blog`,
        publisher: { "@type": "Organization", name: config.brandName },
      },
    ],
  });
}

export async function buildBlogListingHtml(kind: "category" | "tag", slug: string): Promise<string> {
  const config = await resolveBlogConfig();
  const posts = await listPublicBlogPosts({ limit: 50, ...(kind === "category" ? { category: slug } : { tag: slug }) });
  const categories = await listPublicBlogCategories();
  const tags = await listPublicBlogTags();
  const heading = kind === "category" ? `Categoria: ${slug}` : `Tag: ${slug}`;
  const canonicalUrl = `${config.baseUrl}/blog/${kind === "category" ? "categoria" : "tag"}/${slug}`;
  const body = `<div class="page-bg"><div class="shell">
    ${renderBlogHeader(config)}
    ${renderVisibleBreadcrumbs([{ href: "/blog", label: "Blog" }, { label: heading }])}
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="eyebrow">${kind === "category" ? "Categoria" : "Tag"}</span>
          <h1>${escapeHtml(heading)}</h1>
          <p>${posts.length} artigo(s) publicados nesse agrupamento. Cada hub organiza links internos, sem canibalizar a busca com paginas vazias.</p>
        </div>
        <aside class="hero-highlight">
          <h2>Como usar esta pagina</h2>
          <p>Comece pelo artigo mais proximo da sua intencao, depois avance para ajuda e comparativos relacionados.</p>
          <ul>
            <li><a href="/blog">voltar para o blog principal</a></li>
            <li><a href="/ajuda">abrir a central de ajuda</a></li>
            <li><a href="/cadastro">testar o produto no seu fluxo</a></li>
          </ul>
        </aside>
      </div>
    </section>
    <section>
      <div class="grid posts">${posts.map((post) => renderPostCard(post, config)).join("") || `<div class="card"><h2>Nenhum artigo publicado ainda</h2><p>Este agrupamento ainda nao recebeu artigos publicados.</p></div>`}</div>
    </section>
    <section class="split-grid">
      <div class="card"><h2>Outras categorias</h2><ul class="pill-list">${categories.slice(0, 10).map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(humanizeSlug(item.slug))}</a></li>`).join("")}</ul></div>
      <div class="card"><h2>Tags relacionadas</h2><ul class="pill-list">${tags.slice(0, 12).map((item) => `<li><a href="${escapeHtml(item.href)}">#${escapeHtml(item.slug)}</a></li>`).join("")}</ul></div>
    </section>
    ${renderBlogFooter(config, categories, tags)}
  </div></div>`;

  return buildLayoutHtml({
    title: `${heading} | Blog ${config.brandName}`,
    description: `Artigos da ${kind === "category" ? "categoria" : "tag"} ${slug} no blog do ${config.brandName}.`,
    canonicalUrl,
    body,
    ogType: "website",
    structuredData: [
      buildOrganizationJsonLd(config),
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: heading,
        url: canonicalUrl,
        isPartOf: {
          "@type": "Blog",
          name: `${config.brandName} Blog`,
          url: `${config.baseUrl}/blog`,
        },
        about: posts.map((post) => ({
          "@type": "Article",
          headline: post.title,
          url: `${config.baseUrl}/blog/${post.slug}`,
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Blog", item: `${config.baseUrl}/blog` },
          { "@type": "ListItem", position: 2, name: heading, item: canonicalUrl },
        ],
      },
    ],
  });
}

export async function buildBlogPostHtml(slug: string): Promise<string | null> {
  const config = await resolveBlogConfig();
  const post = await getPublicBlogPostBySlug(slug);
  if (!post) return null;

  const faq = normalizeFaq(post.faqJson);
  const contextPack = !isLocalBlogFixtureMode() && post.contextPackId
    ? await db.select().from(blogContextPacks).where(eq(blogContextPacks.id, post.contextPackId)).limit(1).then((rows) => rows[0] || null)
    : null;
  const outline = buildOutlineForPost(post, contextPack);
  const authorProfile = post.authorSlug
    ? await getPublicAuthorProfile(config, post.authorSlug)
    : await getPublicAuthorProfile(config, slugify(config.authorName));
  const references = Array.isArray(post.referencesJson) ? post.referencesJson as Array<Record<string, unknown>> : [];
  const relatedPosts = (await listPublicBlogPosts({ limit: 6 }))
    .filter((item) => item.slug !== post.slug)
    .filter((item) => item.cluster === post.cluster || item.categorySlug === post.categorySlug)
    .slice(0, 3);
  const categories = await listPublicBlogCategories();
  const tags = await listPublicBlogTags();
  const summaryHtml = outline.length > 0
    ? `<div class="sidebar-card"><h3>Sumario</h3><ol>${outline.map((item) => `<li><a href="#${escapeHtml(slugify(item.heading))}">${escapeHtml(item.heading)}</a>${item.angle ? ` <span class="meta">${escapeHtml(item.angle)}</span>` : ""}</li>`).join("")}</ol></div>`
    : "";
  const referencesHtml = references.length > 0
    ? `<section class="card" style="margin-top:22px;"><h2>Fontes e referencias</h2><ul>${references.map((item) => `<li><a href="${escapeHtml(String(item.href || "#"))}" rel="noopener noreferrer">${escapeHtml(String(item.label || item.href || ""))}</a>${item.description ? ` — ${escapeHtml(String(item.description))}` : ""}</li>`).join("")}</ul></section>`
    : "";
  const body = `<div class="page-bg"><div class="shell">
    ${renderBlogHeader(config)}
    ${renderVisibleBreadcrumbs([{ href: "/blog", label: "Blog" }, { href: `/blog/categoria/${post.categorySlug}`, label: humanizeSlug(post.categorySlug) }, { label: post.title }])}
    <div class="article-layout">
      <main class="article-main">
        <article class="article-shell">
          <div class="article-intro">
            <span class="eyebrow">${escapeHtml(humanizeSlug(post.categorySlug))}</span>
            <h1>${escapeHtml(post.title)}</h1>
            <p class="article-kicker">${escapeHtml(post.excerpt)}</p>
            <div class="article-meta-row">
              <span>${post.publishedAt ? toIsoDate(post.publishedAt) : toIsoDate()}</span>
              <span>atualizado ${toIsoDate(toDate(post.updatedAt) || new Date())}</span>
              <span>${post.readingTimeMinutes} min</span>
              <a href="/blog/autor/${escapeHtml(authorProfile.slug)}">${escapeHtml(authorProfile.name)}</a>
            </div>
          </div>
          <figure class="article-cover">
            <img src="${escapeHtml(resolvePostImageUrl(post, config, "16x9"))}" alt="${escapeHtml(post.heroImageAlt || post.title)}" width="1200" height="675" loading="eager" fetchpriority="high" decoding="async" />
            <figcaption>${escapeHtml(post.heroImageAlt || `Ilustracao editorial do artigo ${post.title}`)}</figcaption>
          </figure>
          <section class="blog-proof"><strong>Sobre o autor</strong><p>${escapeHtml(authorProfile.bio)}</p></section>
          ${post.bodyHtml}
        </article>
        ${referencesHtml}
        ${faq.length > 0 ? `<section class="card" style="margin-top:22px;"><h2>Perguntas frequentes</h2>${faq.map((item) => `<div class="faq-card" style="padding:18px 20px; margin-top:12px;"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p></div>`).join("")}</section>` : ""}
        ${relatedPosts.length > 0 ? `<section class="card" style="margin-top:22px;"><div class="section-head"><div><h2>Artigos relacionados</h2><p>Links internos semanticos para aprofundar a mesma busca sem repetir conteudo.</p></div></div><div class="grid posts">${relatedPosts.map((item) => renderPostCard(item, config)).join("")}</div></section>` : ""}
      </main>
      <aside>
        ${summaryHtml}
        <div class="sidebar-card">
          <h3>Continuar navegando</h3>
          <p>Use os hubs e links de suporte para avancar da descoberta para a implementacao.</p>
          <ul class="pill-list">
            <li><a href="/blog/categoria/${escapeHtml(post.categorySlug)}">${escapeHtml(humanizeSlug(post.categorySlug))}</a></li>
            ${Array.isArray(post.tags) ? post.tags.slice(0, 4).map((tag) => `<li><a href="/blog/tag/${escapeHtml(tag)}">#${escapeHtml(tag)}</a></li>`).join("") : ""}
          </ul>
        </div>
        <div class="sidebar-card">
          <h3>Proximos passos</h3>
          <p>Se quiser aplicar a mesma logica no seu fluxo real, use a documentacao do produto e o trial para validar.</p>
          <a class="button" href="/cadastro">Criar conta gratis</a>
          <a class="button-secondary" href="/ajuda">Abrir central de ajuda</a>
        </div>
      </aside>
    </div>
    ${renderBlogFooter(config, categories, tags)}
  </div></div>`;

  return buildLayoutHtml({
    title: post.metaTitle,
    description: post.metaDescription,
    canonicalUrl: post.canonicalUrl,
    ogImage: resolvePostImageUrl(post, config, "16x9"),
    structuredData: buildArticleJsonLd(post, config, faq, authorProfile),
    body,
    extraMeta: `<meta property="article:published_time" content="${escapeHtml(toDate(post.publishedAt)?.toISOString() || new Date().toISOString())}" /><meta property="article:modified_time" content="${escapeHtml(toDate(post.updatedAt)?.toISOString() || new Date().toISOString())}" />`,
  });
}

export async function buildBlogAuthorHtml(slug: string): Promise<string | null> {
  const config = await resolveBlogConfig();
  const author = await getPublicAuthorProfile(config, slug);
  if (!author) return null;
  const metadata = readRecord(author.metadata) || {};
  const expertise = Array.isArray(author.expertise) ? author.expertise.map((item) => String(item)).filter(Boolean) : [];
  const company = typeof metadata.company === "string" ? metadata.company : config.brandName;

  const posts = (isLocalBlogFixtureMode()
    ? createFixturePublishedPosts(config).slice(0, 50)
    : await db.select().from(blogPosts)
      .where(eq(blogPosts.status, "published"))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(50))
    .filter((post) => normalizePublicAuthorSlug(post.authorSlug) === author.slug)
    .slice(0, 20);

  const categories = await listPublicBlogCategories();
  const tags = await listPublicBlogTags();
  const summaries = posts.map(mapPostSummary);
  const body = `<div class="page-bg"><div class="shell">
    ${renderBlogHeader(config)}
    ${renderVisibleBreadcrumbs([{ href: "/blog", label: "Blog" }, { label: author.name }])}
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="eyebrow">Autor</span>
          <h1>${escapeHtml(author.name)}</h1>
          <p>${escapeHtml(author.bio)}</p>
          <div class="article-meta-row"><span>${escapeHtml(author.role)} · ${escapeHtml(company)}</span><a href="/blog">Abrir blog</a></div>
        </div>
        <aside class="hero-highlight">
          <h2>Especialidade editorial</h2>
          <p>${escapeHtml(expertise.length > 0 ? `Conteudos focados em ${expertise.slice(0, 4).join(", ")}.` : "Leituras voltadas para operação comercial, atendimento, agenda e uso prático do WhatsApp no dia a dia.")}</p>
        </aside>
      </div>
    </section>
    <section><div class="section-head"><div><h2>Artigos deste autor</h2><p>Pagina dedicada ajuda a reforcar autoria, contexto tematico e transparencia editorial.</p></div></div><div class="grid posts">${summaries.map((item) => renderPostCard(item, config)).join("")}</div></section>
    ${renderBlogFooter(config, categories, tags)}
  </div></div>`;

  return buildLayoutHtml({
    title: `${author.name} | Blog ${config.brandName}`,
    description: author.bio || `${author.name} escreve sobre WhatsApp, CRM e automacao comercial no blog ${config.brandName}.`,
    canonicalUrl: `${config.baseUrl}/blog/autor/${author.slug}`,
    ogImage: author.avatarUrl || null,
    ogType: "profile",
    structuredData: [
      buildOrganizationJsonLd(config),
      {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        mainEntity: {
          "@type": "Person",
          name: author.name,
          description: author.bio,
          jobTitle: author.role,
          url: `${config.baseUrl}/blog/autor/${author.slug}`,
          worksFor: {
            "@type": "Organization",
            name: company,
            url: config.baseUrl,
          },
          knowsAbout: expertise,
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Blog", item: `${config.baseUrl}/blog` },
          { "@type": "ListItem", position: 2, name: author.name, item: `${config.baseUrl}/blog/autor/${author.slug}` },
        ],
      },
    ],
    body,
  });
}

export async function buildBlogMethodologyHtml(): Promise<string> {
  const config = await resolveBlogConfig();
  const categories = await listPublicBlogCategories();
  const tags = await listPublicBlogTags();
  const body = `<div class="page-bg"><div class="shell">
    ${renderBlogHeader(config)}
    ${renderVisibleBreadcrumbs([{ href: "/blog", label: "Blog" }, { label: "Metodologia editorial" }])}
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="eyebrow">Metodologia editorial</span>
          <h1>Como o blog do ${escapeHtml(config.brandName)} produz e revisa conteudo</h1>
          <p>Os artigos combinam sinais do produto, central de ajuda, Search Console, contexto interno limitado e revisao assistida por IA com governanca real de publicacao.</p>
        </div>
        <aside class="hero-highlight">
          <h2>Objetivo editorial</h2>
          <p>Publicar menos, com mais lastro, melhor navegacao e mais chance de indexacao sustentavel.</p>
          <ul>
            <li>nada de burst diario sem contexto</li>
            <li>sem aprovacao cega de conteudo generico</li>
            <li>links internos e imagens pensados para busca e leitura</li>
          </ul>
        </aside>
      </div>
    </section>
    <section class="split-grid">
      <div class="card">
        <h2>Etapas</h2>
        <ol>
          <li>Discovery de pautas com sinais proprios e queries reais.</li>
          <li>Montagem de context pack curto com ajuda, provas internas e fontes oficiais.</li>
          <li>Redacao, structured output e revisao semantica com Mistral.</li>
          <li>Travas de cadencia para evitar burst e scaled content abuse.</li>
          <li>Refresh guiado por Search Console, metricas e auditoria editorial.</li>
        </ol>
      </div>
      <div class="card">
        <h2>Autoria e imagem</h2>
        <p>Os posts usam autoria humana configurada no sistema. A IA entra como ferramenta editorial e de revisao, nao como mascara para conteudo vazio.</p>
        <p>Para imagem, o fluxo prioriza a API da Mistral; se falhar, cai para Hugging Face e, por ultimo, para um template local rastreavel.</p>
      </div>
    </section>
    ${renderBlogFooter(config, categories, tags)}
  </div></div>`;

  return buildLayoutHtml({
    title: `Metodologia editorial | Blog ${config.brandName}`,
    description: `Como o blog ${config.brandName} usa contexto interno, fontes oficiais e revisao assistida por IA sem publicar em massa.`,
    canonicalUrl: `${config.baseUrl}/blog/${config.methodologySlug}`,
    body,
    ogType: "website",
    structuredData: [
      buildOrganizationJsonLd(config),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `Metodologia editorial ${config.brandName}`,
        url: `${config.baseUrl}/blog/${config.methodologySlug}`,
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Blog", item: `${config.baseUrl}/blog` },
          { "@type": "ListItem", position: 2, name: "Metodologia editorial", item: `${config.baseUrl}/blog/${config.methodologySlug}` },
        ],
      },
    ],
  });
}

export async function generateBlogSitemapXml(): Promise<string> {
  const config = await resolveBlogConfig();
  const posts = await listPublicBlogPosts({ limit: 500 });
  const categories = await listPublicBlogCategories();
  const tags = await listPublicBlogTags();
  const authors = isLocalBlogFixtureMode()
    ? buildFixtureAuthorProfiles(config)
    : await db.select().from(blogAuthorProfiles).orderBy(desc(blogAuthorProfiles.createdAt)).limit(20);
  const entries = [
    { loc: `${config.baseUrl}/blog`, lastmod: toIsoDate(), changefreq: "daily", priority: "0.9" },
    ...categories.map((category) => ({ loc: `${config.baseUrl}${category.href}`, lastmod: toIsoDate(), changefreq: "daily", priority: "0.7" })),
    ...tags.map((tag) => ({ loc: `${config.baseUrl}${tag.href}`, lastmod: toIsoDate(), changefreq: "daily", priority: "0.6" })),
    ...authors.map((author) => ({ loc: `${config.baseUrl}/blog/autor/${author.slug}`, lastmod: toIsoDate(toDate(author.updatedAt) || new Date()), changefreq: "monthly", priority: "0.5" })),
    ...posts.map((post) => ({
      loc: `${config.baseUrl}/blog/${post.slug}`,
      lastmod: toIsoDate(post.publishedAt || new Date()),
      changefreq: "weekly",
      priority: "0.8",
      images: collectPostImageUrls(post as BlogPost, config),
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.map((entry) => `<url><loc>${xmlEscape(entry.loc)}</loc><lastmod>${entry.lastmod}</lastmod><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority>${Array.isArray(entry.images) ? entry.images.map((image) => `<image:image><image:loc>${xmlEscape(image)}</image:loc></image:image>`).join("") : ""}</url>`).join("")}</urlset>`;
}

export async function generateBlogRssXml(): Promise<string> {
  const config = await resolveBlogConfig();
  const posts = await listPublicBlogPosts({ limit: 30 });
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlEscape(`${config.brandName} Blog`)}</title><link>${xmlEscape(`${config.baseUrl}/blog`)}</link><description>${xmlEscape(`Artigos sobre IA no WhatsApp, CRM e automacao comercial publicados pelo ${config.brandName}.`)}</description><language>pt-BR</language>${posts.map((post) => `<item><title>${xmlEscape(post.title)}</title><link>${xmlEscape(`${config.baseUrl}/blog/${post.slug}`)}</link><guid>${xmlEscape(`${config.baseUrl}/blog/${post.slug}`)}</guid><pubDate>${(post.publishedAt || new Date()).toUTCString()}</pubDate><description>${xmlEscape(post.excerpt)}</description></item>`).join("")}</channel></rss>`;
}

export async function getBlogAdminMetrics() {
  await ensureBlogInfrastructure();
  const config = await resolveBlogConfig();
  const [topicStats] = await db.select({ totalTopics: sql<number>`count(*)` }).from(blogTopics);
  const [postStats] = await db.select({
    totalPosts: sql<number>`count(*)`,
    publishedPosts: sql<number>`count(*) filter (where ${blogPosts.status} = 'published')`,
    readyPosts: sql<number>`count(*) filter (where ${blogPosts.status} = 'ready')`,
    archivedPosts: sql<number>`count(*) filter (where ${blogPosts.status} = 'archived')`,
    rejectedPosts: sql<number>`count(*) filter (where ${blogPosts.status} = 'rejected')`,
  }).from(blogPosts);
  const latestPosts = await db.select().from(blogPosts).orderBy(desc(blogPosts.updatedAt)).limit(12);
  const latestChecks = await db.select().from(blogIndexingChecks).orderBy(desc(blogIndexingChecks.checkedAt)).limit(20);
  const latestContextPacks = await db.select().from(blogContextPacks).orderBy(desc(blogContextPacks.createdAt)).limit(10);
  const cadence = await getPublishingCadenceStatus({ cluster: "comparativos", publishedAt: null });

  return {
    topics: Number(topicStats?.totalTopics || 0),
    posts: {
      total: Number(postStats?.totalPosts || 0),
      published: Number(postStats?.publishedPosts || 0),
      ready: Number(postStats?.readyPosts || 0),
      archived: Number(postStats?.archivedPosts || 0),
      rejected: Number(postStats?.rejectedPosts || 0),
    },
    automation: {
      publishEnabled: config.publishEnabled,
      discoveryEnabled: config.discoveryEnabled,
      refreshEnabled: config.refreshEnabled,
      autoApproveEnabled: config.autoApproveEnabled,
      autoPublishEnabled: config.autoPublishEnabled,
      publishMaxPerDay: config.publishMaxPerDay,
      publishMinHoursBetween: config.publishMinHoursBetween,
      publishMaxClusterPerWeek: config.publishMaxClusterPerWeek,
      autoRewriteAttempts: config.autoRewriteAttempts,
    },
    latestPosts: latestPosts.map(mapPostSummary),
    latestChecks,
    latestContextPacks,
    cadence,
  };
}

export async function getBlogAdminDashboard() {
  await ensureBlogInfrastructure();
  const metrics = await getBlogAdminMetrics();
  const pendingTopics = await db.select().from(blogTopics).where(eq(blogTopics.status, "pending")).orderBy(desc(blogTopics.score), desc(blogTopics.createdAt)).limit(20);
  const contextPacks = await db.select().from(blogContextPacks).orderBy(desc(blogContextPacks.createdAt)).limit(20);
  const recentPosts = await db.select({
    id: blogPosts.id,
    title: blogPosts.title,
    slug: blogPosts.slug,
    status: blogPosts.status,
    cluster: blogPosts.cluster,
    categorySlug: blogPosts.categorySlug,
    keywordPrimary: blogPosts.keywordPrimary,
    qualityScore: blogPosts.qualityScore,
    semanticReview: blogPosts.semanticReview,
    reviewNotes: blogPosts.reviewNotes,
    publishEligibleAt: blogPosts.publishEligibleAt,
    publishedAt: blogPosts.publishedAt,
    updatedAt: blogPosts.updatedAt,
    contextPackId: blogPosts.contextPackId,
  }).from(blogPosts).orderBy(desc(blogPosts.updatedAt), desc(blogPosts.createdAt)).limit(20);
  const generationQueue = await db.select().from(blogGenerationJobs).orderBy(desc(blogGenerationJobs.createdAt)).limit(10);
  const publishQueue = (await db.select().from(blogPublishJobs).orderBy(desc(blogPublishJobs.createdAt)).limit(10)).map((job) => {
    if (job.status === "failed" && typeof job.errorMessage === "string" && isGovernanceDeferredPublishError(new Error(job.errorMessage))) {
      return {
        ...job,
        status: "deferred",
      };
    }
    return job;
  });
  return {
    metrics,
    pendingTopics,
    contextPacks,
    recentPosts,
    generationQueue,
    publishQueue,
  };
}

export async function getBlogContextPackById(contextPackId: string) {
  await ensureBlogInfrastructure();
  return db.select().from(blogContextPacks).where(eq(blogContextPacks.id, contextPackId)).limit(1).then((rows) => rows[0] || null);
}

export async function getBlogIndexingStatus() {
  await ensureBlogInfrastructure();
  return db.select({
    id: blogIndexingChecks.id,
    postId: blogIndexingChecks.postId,
    inspectedUrl: blogIndexingChecks.inspectedUrl,
    indexingState: blogIndexingChecks.indexingState,
    coverageState: blogIndexingChecks.coverageState,
    googleCanonical: blogIndexingChecks.googleCanonical,
    userCanonical: blogIndexingChecks.userCanonical,
    sitemaps: blogIndexingChecks.sitemaps,
    verdict: blogIndexingChecks.verdict,
    checkedAt: blogIndexingChecks.checkedAt,
  }).from(blogIndexingChecks).orderBy(desc(blogIndexingChecks.checkedAt)).limit(50);
}

export const __blogTestUtils = {
  slugify,
  readingTimeFromText,
  similarityScore,
  extractJsonObject,
};

