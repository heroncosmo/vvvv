import test from "node:test";
import assert from "node:assert/strict";
import {
  blogSimilarityScore,
  buildBlogApprovalSummary,
  extractFirstJsonObject,
  isBlogPublishableImageAsset,
  readingTimeForBlog,
  resolveBlogPostStatusAfterEditorialUpdate,
  slugifyBlogValue,
} from "../blogUtils";

test("slugify normaliza acentos e espacos", () => {
  assert.equal(slugifyBlogValue("IA para Salão no WhatsApp"), "ia-para-salao-no-whatsapp");
});

test("readingTimeFromText nunca retorna zero", () => {
  assert.equal(readingTimeForBlog("texto curto"), 1);
});

test("similarityScore distingue textos diferentes", () => {
  const high = blogSimilarityScore(
    "crm para whatsapp com historico e funil",
    "crm para whatsapp com historico e funil comercial",
  );
  const low = blogSimilarityScore(
    "crm para whatsapp com historico e funil",
    "agendamento para clinica com confirmacao automatica",
  );

  assert.ok(high > low);
});

test("extractFirstJsonObject encontra o primeiro JSON valido sem regex", () => {
  const payload = extractFirstJsonObject('Resposta preliminar {"passed":true,"notes":["ok"],"nested":{"value":1}} fim');
  assert.deepEqual(payload, {
    passed: true,
    notes: ["ok"],
    nested: { value: 1 },
  });
});

test("buildBlogApprovalSummary libera auto aprovacao quando guardrails passam", () => {
  const summary = buildBlogApprovalSummary({
    passed: true,
    qualityScore: 92,
    duplicateSimilarity: 0.22,
    internalProofCount: 3,
    requiredInternalLinks: 5,
    unsupportedClaims: 0,
    peopleFirstScore: 91,
    originalityScore: 87,
    autoApproveEnabled: true,
    autoPublishEnabled: true,
    publishEnabled: true,
    notes: ["Boa cobertura da busca principal"],
  });

  assert.equal(summary.decision, "auto-approved");
  assert.equal(summary.autoApproved, true);
  assert.equal(summary.canAutoPublish, true);
  assert.equal(summary.meetsQualityBar, true);
  assert.equal(summary.meetsAutoPublishBar, true);
  assert.deepEqual(summary.blockingReasons, []);
});

test("buildBlogApprovalSummary bloqueia conteudo com falta de evidencias", () => {
  const summary = buildBlogApprovalSummary({
    passed: false,
    qualityScore: 62,
    duplicateSimilarity: 0.81,
    internalProofCount: 1,
    requiredInternalLinks: 2,
    unsupportedClaims: 2,
    peopleFirstScore: 55,
    originalityScore: 58,
    autoApproveEnabled: true,
    autoPublishEnabled: true,
    publishEnabled: true,
    factualIssues: ["Promessa sem prova do produto"],
  });

  assert.equal(summary.decision, "blocked");
  assert.equal(summary.autoApproved, false);
  assert.equal(summary.canAutoPublish, false);
  assert.ok(summary.blockingReasons.length >= 4);
  assert.ok(summary.improvementActions.includes("Promessa sem prova do produto"));
});

test("buildBlogApprovalSummary exige barra mais alta para auto publicar", () => {
  const summary = buildBlogApprovalSummary({
    passed: true,
    qualityScore: 89,
    duplicateSimilarity: 0.4,
    internalProofCount: 3,
    requiredInternalLinks: 5,
    unsupportedClaims: 0,
    peopleFirstScore: 87,
    originalityScore: 83,
    autoApproveEnabled: true,
    autoPublishEnabled: true,
    publishEnabled: true,
    seoIssues: ["Adicionar mais um link contextual na abertura."],
  });

  assert.equal(summary.decision, "auto-approved");
  assert.equal(summary.autoApproved, true);
  assert.equal(summary.canAutoPublish, false);
  assert.equal(summary.meetsQualityBar, true);
  assert.equal(summary.meetsAutoPublishBar, false);
});

test("buildBlogApprovalSummary aceita auto publicacao com score excepcional e limpo", () => {
  const summary = buildBlogApprovalSummary({
    passed: true,
    qualityScore: 93,
    duplicateSimilarity: 0.18,
    internalProofCount: 3,
    requiredInternalLinks: 5,
    unsupportedClaims: 0,
    peopleFirstScore: 90,
    originalityScore: 89,
    autoApproveEnabled: true,
    autoPublishEnabled: true,
    publishEnabled: true,
  });

  assert.equal(summary.decision, "auto-approved");
  assert.equal(summary.autoApproved, true);
  assert.equal(summary.canAutoPublish, true);
});

test("buildBlogApprovalSummary nao auto aprova se score humano ainda estiver abaixo da barra", () => {
  const summary = buildBlogApprovalSummary({
    passed: true,
    qualityScore: 84,
    duplicateSimilarity: 0.18,
    internalProofCount: 3,
    requiredInternalLinks: 5,
    unsupportedClaims: 0,
    peopleFirstScore: 82,
    originalityScore: 80,
    autoApproveEnabled: true,
    autoPublishEnabled: true,
    publishEnabled: true,
  });

  assert.equal(summary.decision, "needs-review");
  assert.equal(summary.autoApproved, false);
  assert.equal(summary.meetsQualityBar, false);
  assert.equal(summary.meetsAutoPublishBar, false);
});

test("refresh nao despublica post ja publicado", () => {
  const status = resolveBlogPostStatusAfterEditorialUpdate({
    currentStatus: "published",
    approvalDecision: "blocked",
    isRefresh: true,
  });

  assert.equal(status, "published");
});

test("edicao normal continua mandando bloqueado para rejected", () => {
  const status = resolveBlogPostStatusAfterEditorialUpdate({
    currentStatus: "ready",
    approvalDecision: "blocked",
    isRefresh: false,
  });

  assert.equal(status, "rejected");
});

test("imagem so e publicavel quando for IA em storage duravel", () => {
  assert.equal(isBlogPublishableImageAsset({
    provider: "nvidia",
    publicUrl: "https://xyz.supabase.co/storage/v1/object/public/blog-assets/posts/post.jpg",
    sourceProvenance: { storage: { provider: "supabase" } },
  }), true);

  assert.equal(isBlogPublishableImageAsset({
    provider: "template",
    publicUrl: "/uploads/blog-assets/post.svg",
    sourceProvenance: { storage: { provider: "local-cache" } },
  }), false);

  assert.equal(isBlogPublishableImageAsset({
    provider: "nvidia",
    publicUrl: "https://agentezap.online/uploads/blog-assets/post.jpg",
    sourceProvenance: { storage: { provider: "local-cache" } },
  }), false);
});
