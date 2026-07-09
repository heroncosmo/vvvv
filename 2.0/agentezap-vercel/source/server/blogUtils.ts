export function slugifyBlogValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function stripBlogHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function readingTimeForBlog(text: string): number {
  const words = stripBlogHtml(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 190));
}

export function blogSimilarityScore(a: string, b: string): number {
  const tokensA = new Set(stripBlogHtml(a).toLowerCase().split(/\s+/).filter((item) => item.length > 3));
  const tokensB = new Set(stripBlogHtml(b).toLowerCase().split(/\s+/).filter((item) => item.length > 3));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function extractFirstJsonObject(raw: string): unknown {
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

  throw new Error("Nenhum JSON valido encontrado");
}

export type BlogApprovalDecision = "auto-approved" | "needs-review" | "blocked";
export type BlogEditorialStatus = "draft" | "ready" | "published" | "rejected" | "archived";

export interface BlogApprovalSummaryInput {
  passed: boolean;
  qualityScore: number;
  duplicateSimilarity: number;
  internalProofCount: number;
  requiredInternalLinks: number;
  unsupportedClaims: number;
  peopleFirstScore: number;
  originalityScore: number;
  notes?: string[];
  factualIssues?: string[];
  seoIssues?: string[];
  styleIssues?: string[];
  suggestedFixes?: string[];
  autoApproveEnabled: boolean;
  autoPublishEnabled: boolean;
  publishEnabled: boolean;
}

export interface BlogApprovalSummary {
  decision: BlogApprovalDecision;
  autoApproved: boolean;
  canAutoPublish: boolean;
  meetsQualityBar: boolean;
  meetsAutoPublishBar: boolean;
  blockingReasons: string[];
  improvementActions: string[];
}

export interface BlogImagePublicationInput {
  provider: string | null | undefined;
  publicUrl: string | null | undefined;
  sourceProvenance?: Record<string, unknown> | null | undefined;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function isBlogAiImageProvider(provider: string | null | undefined): boolean {
  return provider === "nvidia" || provider === "mistral" || provider === "huggingface";
}

export function isBlogDurableImageUrl(input: Pick<BlogImagePublicationInput, "publicUrl" | "sourceProvenance">): boolean {
  if (!input.publicUrl) {
    return false;
  }

  const storage = readObject(readObject(input.sourceProvenance)?.storage);
  if (storage?.provider === "supabase") {
    return true;
  }

  try {
    const parsed = new URL(input.publicUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return parsed.pathname.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

export function isBlogPublishableImageAsset(input: BlogImagePublicationInput): boolean {
  return isBlogAiImageProvider(input.provider) && isBlogDurableImageUrl(input);
}

export function resolveBlogPostStatusAfterEditorialUpdate(input: {
  currentStatus: BlogEditorialStatus | null;
  approvalDecision: BlogApprovalDecision;
  isRefresh: boolean;
}): BlogEditorialStatus {
  if (input.isRefresh && input.currentStatus === "published") {
    return "published";
  }

  return input.approvalDecision === "blocked" ? "rejected" : "ready";
}

export function buildBlogApprovalSummary(input: BlogApprovalSummaryInput): BlogApprovalSummary {
  const blockingReasons: string[] = [];

  if (!input.passed) {
    blockingReasons.push("A revisao semantica bloqueou a publicacao automatica.");
  }
  if (input.internalProofCount < 3) {
    blockingReasons.push("Faltam provas internas suficientes do produto.");
  }
  if (input.requiredInternalLinks < 5) {
    blockingReasons.push("O artigo ainda tem poucos links internos semanticos.");
  }
  if (input.duplicateSimilarity > 0.76) {
    blockingReasons.push("O texto ficou proximo demais de outro artigo ja publicado.");
  }
  if (input.unsupportedClaims > 0) {
    blockingReasons.push("Ainda existem claims sem sustentacao clara.");
  }

  const improvementActions = [
    ...(input.notes || []),
    ...(input.factualIssues || []),
    ...(input.seoIssues || []),
    ...(input.styleIssues || []),
    ...(input.suggestedFixes || []),
  ].filter(Boolean);

  if (blockingReasons.length > 0) {
    return {
      decision: "blocked",
      autoApproved: false,
      canAutoPublish: false,
      meetsQualityBar: false,
      meetsAutoPublishBar: false,
      blockingReasons,
      improvementActions,
    };
  }

  const qualityReady =
    input.qualityScore >= 88 &&
    input.peopleFirstScore >= 86 &&
    input.originalityScore >= 82;

  const autoPublishReady =
    input.qualityScore >= 92 &&
    input.peopleFirstScore >= 90 &&
    input.originalityScore >= 86 &&
    input.duplicateSimilarity <= 0.46 &&
    input.internalProofCount >= 3 &&
    input.requiredInternalLinks >= 5 &&
    input.unsupportedClaims === 0 &&
    (input.factualIssues?.length || 0) === 0 &&
    (input.styleIssues?.length || 0) <= 1 &&
    (input.seoIssues?.length || 0) <= 1;

  const autoApproved = input.autoApproveEnabled && qualityReady;

  return {
    decision: autoApproved ? "auto-approved" : "needs-review",
    autoApproved,
    canAutoPublish: autoApproved && autoPublishReady && input.autoPublishEnabled && input.publishEnabled,
    meetsQualityBar: qualityReady,
    meetsAutoPublishBar: autoPublishReady,
    blockingReasons: [],
    improvementActions,
  };
}
